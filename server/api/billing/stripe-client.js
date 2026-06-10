import Stripe from "stripe";
import { requiredEnv } from "../_shared.js";

export const stripeApiVersion = Stripe.API_VERSION;

export function createStripeClient() {
  return new Stripe(requiredEnv("STRIPE_SECRET_KEY"), {
    apiVersion: stripeApiVersion,
  });
}
