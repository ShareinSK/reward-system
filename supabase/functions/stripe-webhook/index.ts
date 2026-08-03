// Supabase Edge Function: Stripe webhooks → household_entitlements
import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

Deno.serve(async (req) => {
	const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
	const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
	const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
	const supabaseUrl = Deno.env.get('SUPABASE_URL');

	if (!stripeKey || !webhookSecret || !serviceKey || !supabaseUrl) {
		return new Response('Stripe webhook not configured', { status: 503 });
	}

	const stripe = new Stripe(stripeKey, { apiVersion: '2024-11-20.acacia' });
	const admin = createClient(supabaseUrl, serviceKey);
	const signature = req.headers.get('stripe-signature');
	if (!signature) return new Response('Missing signature', { status: 400 });

	const body = await req.text();
	let event: Stripe.Event;
	try {
		event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return new Response(`Webhook Error: ${message}`, { status: 400 });
	}

	async function setPro(householdId: string, customerId: string | null, subscriptionId: string | null, periodEnd: number | null) {
		await admin.from('household_entitlements').upsert({
			household_id: householdId,
			plan: 'pro',
			status: 'active',
			stripe_customer_id: customerId,
			stripe_subscription_id: subscriptionId,
			current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
			admin_override: false,
			updated_at: new Date().toISOString()
		});
	}

	async function setFree(householdId: string, status = 'canceled') {
		await admin
			.from('household_entitlements')
			.update({
				plan: 'free',
				status,
				stripe_subscription_id: null,
				updated_at: new Date().toISOString()
			})
			.eq('household_id', householdId);
	}

	try {
		switch (event.type) {
			case 'checkout.session.completed': {
				const session = event.data.object as Stripe.Checkout.Session;
				const householdId =
					session.metadata?.household_id || (session.client_reference_id as string | null);
				if (householdId) {
					await setPro(
						householdId,
						typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null,
						typeof session.subscription === 'string'
							? session.subscription
							: session.subscription?.id ?? null,
						null
					);
				}
				break;
			}
			case 'customer.subscription.updated':
			case 'customer.subscription.created': {
				const sub = event.data.object as Stripe.Subscription;
				const householdId = sub.metadata?.household_id;
				if (!householdId) break;
				if (sub.status === 'active' || sub.status === 'trialing') {
					await setPro(
						householdId,
						typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
						sub.id,
						sub.current_period_end
					);
					if (sub.status === 'trialing') {
						await admin
							.from('household_entitlements')
							.update({
								plan: 'trial',
								trial_ends_at: sub.trial_end
									? new Date(sub.trial_end * 1000).toISOString()
									: null
							})
							.eq('household_id', householdId);
					}
				} else if (sub.status === 'past_due') {
					await admin
						.from('household_entitlements')
						.update({ status: 'past_due', updated_at: new Date().toISOString() })
						.eq('household_id', householdId);
				} else if (sub.status === 'canceled' || sub.status === 'unpaid') {
					await setFree(householdId, sub.status);
				}
				break;
			}
			case 'customer.subscription.deleted': {
				const sub = event.data.object as Stripe.Subscription;
				const householdId = sub.metadata?.household_id;
				if (householdId) await setFree(householdId, 'canceled');
				break;
			}
			case 'invoice.payment_failed': {
				const invoice = event.data.object as Stripe.Invoice;
				const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
				if (customerId) {
					await admin
						.from('household_entitlements')
						.update({ status: 'past_due', updated_at: new Date().toISOString() })
						.eq('stripe_customer_id', customerId);
				}
				break;
			}
			default:
				break;
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return new Response(message, { status: 500 });
	}

	return new Response(JSON.stringify({ received: true }), {
		headers: { 'Content-Type': 'application/json' }
	});
});
