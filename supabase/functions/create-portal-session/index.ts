// Supabase Edge Function: Stripe Customer Portal
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
		const returnUrl = String(body.return_url || '');
		if (!returnUrl) throw new Error('return_url required');

		const { data: profile } = await admin
			.from('profiles')
			.select('active_household_id')
			.eq('id', user.id)
			.single();
		const householdId = profile?.active_household_id as string | null;
		if (!householdId) throw new Error('No active household');

		const { data: entitlement } = await admin
			.from('household_entitlements')
			.select('stripe_customer_id')
			.eq('household_id', householdId)
			.maybeSingle();
		if (!entitlement?.stripe_customer_id) throw new Error('No Stripe customer on file');

		const stripe = new Stripe(stripeKey, { apiVersion: '2024-11-20.acacia' });
		const portal = await stripe.billingPortal.sessions.create({
			customer: entitlement.stripe_customer_id,
			return_url: returnUrl
		});

		return new Response(JSON.stringify({ url: portal.url }), {
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
