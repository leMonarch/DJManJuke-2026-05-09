// scripts/create-payment.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY); // mets ta clé test dans .env ou en variable

async function main() {
  const intent = await stripe.paymentIntents.create({
    amount: 6000,
    currency: 'cad',
    payment_method_types: ['card'],
    payment_method: 'pm_card_visa',
    confirm: true,
    transfer_data: { destination: 'acct_1SU8bO0wbBhMY2Uk' },
    description: 'Priorité DJMan test',
  });
  console.log(intent.id, intent.status);
}

main().catch(console.error);