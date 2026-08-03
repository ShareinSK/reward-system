// Supabase Edge Function: create Stripe Checkout Session for Pro
import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const cors = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

Deno.serve(async (req) => {
	if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

	try {
		const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
		if (!stripeKey) {
			return new Response(JSON.stringify({ error: 'Stripe is not configured yet.' }), {
				status: 503,
				headers: { ...cors, 'Content-Type': 'application/json' }
			});
		}

		const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
		const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
		const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
		const authHeader = req.headers.get('Authorization');
		if (!authHeader) throw new Error('Missing authorization');

		const userClient = createClient(supabaseUrl, anonKey, {
			global: { headers: { Authorization: authHeader } }
		});
		const admin = createClient(supabaseUrl, serviceKey);

		const {
			data: { user },
			error: userError
		} = await userClient.auth.getUser();
		if (userError || !user) throw new Error('Not authenticated');

		const body = await req.json();
		const country = String(body.country_or_region || 'US').toUpperCase();
		const successUrl = String(body.success_url || '');
		const cancelUrl = String(body.cancel_url || '');
		if (!successUrl || !cancelUrl) throw new Error('success_url and cancel_url required');

		const { data: profile } = await admin
			.from('profiles')
			.select('active_household_id, display_name')
			.eq('id', user.id)
			.single();
		const householdId = profile?.active_household_id as string | null;
		if (!householdId) throw new Error('No active household');

		const { data: membership } = await admin
			.from('household_members')
			.select('role')
			.eq('household_id', householdId)
			.eq('user_id', user.id)
			.maybeSingle();
		if (membership?.role !== 'owner') throw new Error('Only the owner can subscribe');

		let { data: price } = await admin
			.from('plan_prices')
			.select('*')
			.eq('country_or_region', country)
			.eq('active', true)
			.maybeSingle();
		if (!price?.stripe_price_id) {
			const fallback = await admin
				.from('plan_prices')
				.select('*')
				.eq('country_or_region', 'DEFAULT')
				.eq('active', true)
				.maybeSingle();
			price = fallback.data;
		}
		if (!price?.stripe_price_id) {
			throw new Error('No Stripe price configured for this region. Set stripe_price_id in admin.');
		}

		const stripe = new Stripe(stripeKey, { apiVersion: '2024-11-20.acacia' });

		const { data: entitlement } = await admin
			.from('household_entitlements')
			.select('*')
			.eq('household_id', householdId)
			.maybeSingle();

		let customerId = entitlement?.stripe_customer_id as string | null;
		if (!customerId) {
			const customer = await stripe.customers.create({
				email: user.email,
				name: profile?.display_name ?? undefined,
				metadata: { household_id: householdId, user_id: user.id }
			});
			customerId = customer.id;
			await admin.from('household_entitlements').upsert({
				household_id: householdId,
				stripe_customer_id: customerId,
				updated_at: new Date().toISOString()
			});
		}

		const session = await stripe.checkout.sessions.create({
			mode: 'subscription',
			customer: customerId,
			line_items: [{ price: price.stripe_price_id, quantity: 1 }],
			success_url: successUrl,
			cancel_url: cancelUrl,
			client_reference_id: householdId,
			metadata: { household_id: householdId },
			subscription_data: {
				metadata: { household_id: householdId },
				trial_period_days: entitlement?.plan === 'free' ? 15 : undefined
			},
			allow_promotion_codes: true
		});

		return new Response(JSON.stringify({ url: session.url }), {
			headers: { ...cors, 'Content-Type': 'application/json' }
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return new Response(JSON.stringify({ error: message }), {
			status: 400,
			headers: { ...cors, 'Content-Type': 'application/json' }
		});
	}
});
