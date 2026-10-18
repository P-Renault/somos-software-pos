import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'BOOM_TEST_EMAIL', 'BOOM_TEST_PASSWORD', 'BOOM_TEST_PRODUCT_ID'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) throw new Error(`Faltan variables: ${missing.join(', ')}`);
if (process.env.BOOM_TEST_MODE !== '1') throw new Error('Bloqueado: define BOOM_TEST_MODE=1 solo para un proyecto Supabase de pruebas.');
if (process.env.BOOM_TEST_CONFIRM !== 'I_CONFIRM_TEST_DATABASE') throw new Error('Bloqueado: define BOOM_TEST_CONFIRM=I_CONFIRM_TEST_DATABASE tras confirmar que NO es producción.');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
  email: process.env.BOOM_TEST_EMAIL,
  password: process.env.BOOM_TEST_PASSWORD,
});
if (authError || !auth.session) throw new Error(`Autenticación de usuario de pruebas falló: ${authError?.message ?? 'sin sesión'}`);

const { data: product, error: productError } = await supabase
  .from('products')
  .select('id,name,sale_price,stock,active')
  .eq('id', process.env.BOOM_TEST_PRODUCT_ID)
  .single();
if (productError || !product) throw new Error(`No se pudo leer el producto de pruebas: ${productError?.message ?? 'no encontrado'}`);
if (product.active !== true) throw new Error('El producto de pruebas no está activo.');
if (Number(product.stock) < 2) throw new Error(`Stock insuficiente para la prueba segura. Stock actual: ${product.stock}; se requiere al menos 2.`);

const quantity = 1;
const total = Math.round(Number(product.sale_price) * quantity);
if (!Number.isFinite(total) || total <= 0) throw new Error('El producto de prueba debe tener un precio positivo.');
const key = `boom-concurrency-test-${randomUUID()}`;
const args = {
  p_idempotency_key: key,
  p_items: [{ product_id: product.id, quantity }],
  p_payment_method: 'cash',
  p_customer_name: 'PRUEBA TÉCNICA — NO DESPACHAR',
  p_customer_rut: null,
  p_document_type: 39,
  p_cash_received: total,
  p_payments: [],
};

console.log(`Producto de prueba: ${product.name} (${product.id})`);
console.log(`Clave única de prueba: ${key}`);
console.log('Enviando dos RPC en paralelo con idénticos argumentos…');
const results = await Promise.all([
  supabase.rpc('complete_sale_atomic', args),
  supabase.rpc('complete_sale_atomic', args),
]);
const errors = results.map((result) => result.error).filter(Boolean);
if (errors.length) throw new Error(`RPC falló: ${errors.map((e) => e.message).join(' | ')}. Revisa el entorno de pruebas antes de reintentar.`);
const payloads = results.map((result) => result.data);
if (payloads.some((data) => !data?.ok || !data?.sale_id)) {
  throw new Error(`Respuesta inesperada. Revisa manualmente el entorno de pruebas: ${JSON.stringify(payloads)}`);
}
const saleIds = new Set(payloads.map((data) => data.sale_id));
if (saleIds.size !== 1) throw new Error(`FALLO: se devolvieron distintas ventas: ${[...saleIds].join(', ')}`);
if (!payloads.some((data) => data.idempotent_replay === true)) {
  throw new Error('INCONCLUSO: no se observó idempotent_replay=true en ninguna respuesta. Verifica el contrato de la RPC.');
}
console.log(JSON.stringify({
  status: 'RPC_IDEMPOTENCY_PASS',
  sale_id: payloads[0].sale_id,
  sale_number: payloads[0].sale_number,
  total_amount: payloads[0].total_amount,
  replay_flags: payloads.map((data) => data.idempotent_replay),
  note: 'Verifica además en Supabase que haya una sola venta, una línea, un pago y un movimiento de inventario para esta clave antes de dar por aprobada la prueba completa.',
}, null, 2));
