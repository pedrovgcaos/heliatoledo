// "Pendientes": what's left to finish the site. Automatic items check themselves;
// manual items are ticked in the panel and saved in settings/checklist.json.
import { readDoc, writeDoc } from './store.js';
import { getSettings } from './catalog.js';
import { getIndex } from './orders.js';
import { emailConfigured } from './email.js';

const DOC = 'settings/checklist.json';

export const ITEMS = [
  // group, id, title, detail, link (panel hash or external), auto?
  ['Tienda', 'envios', 'Definir los costes de envío',
    'Pon el coste por pedido de cada zona (España, UE, resto de Europa, resto del mundo). Las zonas vacías entran como «envío por confirmar».', '#ajustes', true],
  ['Tienda', 'pago', 'Escribir cómo pagar',
    'IBAN y titular, Bizum o PayPal, en inglés y en español. Se muestra al cliente tras el pedido y en el mensaje «Pedir el pago».', '#ajustes', true],
  ['Tienda', 'prueba', 'Cancelar los pedidos de prueba',
    'Los pedidos de prueba (con «prueba» en el nombre) deben quedar cancelados para no contar en el resumen.', '#pedidos', true],
  ['Tienda', 'pedido-real', 'Hacer un pedido real de principio a fin',
    'Compra un tapiz desde la web, márcalo como pagado y como enviado, y comprueba la página de seguimiento del cliente.', '/shop/', false],
  ['Tienda', 'emails', 'Activar los e-mails automáticos (opcional)',
    'Con una cuenta de Resend y las variables RESEND_API_KEY y EMAIL_FROM en Vercel, el cliente recibe la confirmación y tú el aviso de cada pedido nuevo. Sin ellos, escribe al cliente desde cada pedido.', '', true],
  ['Legal', 'terminos', 'Publicar los términos y condiciones de venta',
    'Obligatorios para vender online en España: datos del vendedor, precios con IVA, envío y plazos, derecho de desistimiento de 14 días, devoluciones y garantía. En la web antigua esta página estaba vacía.', '', false],
  ['Legal', 'privacidad', 'Actualizar la política de privacidad',
    'Ahora la web guarda nombre, e-mail, teléfono y dirección de los pedidos (en Vercel, Unión Europea). Indicar la finalidad, el plazo de conservación y cómo ejercer los derechos.', '/legal/privacy-policy/', false],
  ['Legal', 'cookies', 'Simplificar la política de cookies',
    'La nueva web no usa cookies de análisis ni de publicidad: solo una cookie técnica para entrar en este panel y el carrito guardado en el navegador. Ya no hace falta el aviso de cookies.', '/legal/cookies/', false],
  ['Dominio', 'dominio', 'Conectar heliatoledo.com a la nueva web',
    'Añadir heliatoledo.com y www.heliatoledo.com al proyecto en Vercel, cambiar los DNS, poner SITE_URL=https://www.heliatoledo.com y volver a publicar. Las direcciones antiguas ya redirigen solas.', '', true],
  ['Dominio', 'woocommerce', 'Cerrar la tienda antigua (WordPress / WooCommerce)',
    'Después del cambio de dominio: exportar los pedidos antiguos si se necesitan y dar de baja el hosting y los plugins de pago.', '', false],
  ['Contenido', 'revisar', 'Revisar textos e imágenes con Helia',
    'Biografía, descripciones de proyectos y tapices. Se corrigieron dos nombres para coincidir con el portfolio: «Almond Tree» y «Chrysanthemums».', '/', false],
  ['Contenido', 'categorias', 'Decidir sobre «originals» y «prints»',
    'Eran categorías de la tienda antigua sin productos. No se crearon en la web nueva; si Helia quiere vender originales o láminas, hay que añadirlos.', '', false],
];

async function autoStatus() {
  const [settings, index] = await Promise.all([getSettings(), getIndex()]);
  const site = process.env.SITE_URL || '';
  const tests = index.filter(r => /prueba|test/i.test(r.name) && r.status !== 'cancelado');
  return {
    envios: { done: Object.values(settings.shipping).some(v => Number.isFinite(v)) },
    pago: { done: Boolean(settings.paymentInstructions.en || settings.paymentInstructions.es) },
    prueba: { done: !tests.length, note: tests.length ? `Sin cancelar: ${tests.map(t => t.id).join(', ')}` : '' },
    emails: { done: emailConfigured() },
    dominio: { done: /(^|\/\/)(www\.)?heliatoledo\.com/i.test(site), note: site ? `Dirección actual: ${site.replace(/^https?:\/\//, '')}` : '' },
  };
}

export async function getChecklist() {
  const [{ data }, auto] = await Promise.all([readDoc(DOC), autoStatus()]);
  const manual = data || {};
  return ITEMS.map(([group, id, title, detail, link, isAuto]) => ({
    group, id, title, detail, link, auto: isAuto,
    done: isAuto ? Boolean(auto[id]?.done) : Boolean(manual[id]?.done),
    note: isAuto ? auto[id]?.note || '' : '',
    doneAt: isAuto ? null : manual[id]?.at || null,
  }));
}

export async function setManual(id, done) {
  const item = ITEMS.find(i => i[1] === id);
  if (!item || item[5]) return false; // unknown or automatic
  const { data } = await readDoc(DOC);
  const next = { ...(data || {}) };
  if (done) next[id] = { done: true, at: new Date().toISOString() };
  else delete next[id];
  await writeDoc(DOC, next);
  return true;
}
