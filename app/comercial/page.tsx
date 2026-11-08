import Image from "next/image";
import Link from "next/link";
import styles from "./comercial.module.css";

const plans = [
  { name: "Gratis", description: "Para comenzar a operar", price: "$0", features: ["1 usuario", "1 caja", "Hasta 10 productos", "Hasta 50 ventas al mes"] },
  { name: "Emprendedor", description: "Operación esencial para un negocio pequeño", price: "$4.990", features: ["1 usuario", "1 caja", "Catálogo e inventario", "Ventas y compras"] },
  { name: "Pro", description: "Más capacidad para negocios en crecimiento", price: "$9.990", features: ["Hasta 3 usuarios", "Ventas e inventario", "Compras y proveedores", "Reportes operativos"] },
  { name: "Business", description: "Operación para equipos y más de una caja", price: "$19.990", features: ["Hasta 5 usuarios", "Hasta 3 cajas", "Módulos comerciales", "Reportes y finanzas"], featured: true },
];

const features = [
  ["↗", "Ventas rápidas", "Registra operaciones y consulta el detalle de cada venta."],
  ["◇", "Productos e inventario", "Administra catálogo, precios y existencias desde un solo lugar."],
  ["▤", "Compras y proveedores", "Mantén ordenadas tus compras y la información de proveedores."],
  ["♙", "Clientes", "Centraliza los datos de tus clientes y su actividad comercial."],
  ["▥", "Caja y finanzas", "Controla movimientos y revisa indicadores de tu operación."],
  ["▧", "Reportes", "Consulta información para tomar mejores decisiones."],
];

export default function ComercialPage() {
  return <main className={styles.page}>
    <header className={styles.header}>
      <Link href="/comercial" className={styles.brand} aria-label="BOOM POS, inicio">
        <Image src="/boom-pos-logo.png" alt="BOOM POS" width={174} height={76} priority />
      </Link>
      <nav className={styles.nav}>
        <a href="#funcionalidades">Funcionalidades</a><a href="#planes">Planes</a><a href="#integracion">Integración</a><a href="#contacto">Contacto</a>
      </nav>
      <Link className={styles.headerCta} href="/login">Comenzar ahora <span>→</span></Link>
    </header>

    <section className={styles.hero}>
      <div className={styles.heroCopy}>
        <span className={styles.eyebrow}>GESTIÓN COMERCIAL PARA TU NEGOCIO</span>
        <h1>Tu negocio,<br/>en <em>un solo sistema.</em></h1>
        <p>Vende, controla tu inventario y administra tu operación comercial con BOOM POS. Una plataforma clara, práctica y accesible desde cualquier lugar.</p>
        <div className={styles.heroActions}><a className={styles.primary} href="#planes">Ver planes y precios <span>→</span></a><Link className={styles.secondary} href="/login">Ingresar al sistema</Link></div>
        <div className={styles.proofs}><span>✓ Gestión en la nube</span><span>✓ Acceso desde distintos dispositivos</span><span>✓ Planes para cada etapa</span></div>
      </div>
      <div className={styles.heroVisual}>
        <div className={styles.glow}/>
        <div className={styles.screen}><div className={styles.screenTop}><b>BOOM <i>POS</i></b><span>Panel de ventas</span><span className={styles.avatar}>P</span></div><Image src="/boom-pos-dashboard.jpg" alt="Panel de gestión comercial BOOM POS" width={1356} height={687} priority className={styles.dashboard}/></div>
        <div className={styles.floatingCard}><span className={styles.floatIcon}>↗</span><div><small>Tu operación, más ordenada</small><b>Todo conectado</b></div></div>
        <div className={styles.orangeOrb}/>
      </div>
    </section>

    <section className={styles.featureStrip} aria-label="Áreas de gestión">
      {["Ventas","Inventario","Compras","Clientes","Caja y finanzas","Reportes"].map((item,i)=><div key={item}><span>{["🛒","◇","▤","♙","▣","▥"][i]}</span><b>{item}</b></div>)}
    </section>

    <section className={styles.featuresSection} id="funcionalidades">
      <div className={styles.sectionIntro}><span className={styles.eyebrow}>UNA VISIÓN COMPLETA</span><h2>Administra tu negocio<br/>con <em>más claridad.</em></h2><p>Las herramientas esenciales para organizar el trabajo diario y tener el control de tu operación.</p></div>
      <div className={styles.featureGrid}>{features.map(([icon,title,desc])=><article className={styles.featureCard} key={title}><span className={styles.featureIcon}>{icon}</span><h3>{title}</h3><p>{desc}</p></article>)}</div>
    </section>

    <section className={styles.productBand}>
      <div><span className={styles.eyebrow}>DISEÑADO PARA EL DÍA A DÍA</span><h2>Menos tareas dispersas.<br/><em>Más control.</em></h2><p>Desde el registro de una venta hasta el seguimiento del inventario, BOOM POS reúne la información de tu negocio en una experiencia sencilla.</p><Link className={styles.primary} href="/login">Conocer BOOM POS <span>→</span></Link></div>
      <div className={styles.productPreview}><Image src="/boom-pos-dashboard.jpg" alt="Vista real del dashboard BOOM POS" width={1356} height={687}/><div className={styles.previewCaption}><b>Panel de control</b><span>Vista real del sistema</span></div></div>
    </section>

    <section className={styles.pricing} id="planes">
      <div className={styles.centerIntro}><span className={styles.eyebrow}>PRECIOS TRANSPARENTES</span><h2>Un plan para cada <em>negocio.</em></h2><p>Comienza gratis y amplía tu capacidad cuando lo necesites.</p></div>
      <div className={styles.planGrid}>{plans.map(plan=><article className={`${styles.plan} ${plan.featured?styles.featured:""}`} key={plan.name}>
        {plan.featured&&<span className={styles.popular}>RECOMENDADO</span>}
        <span className={styles.planLabel}>PLAN BOOM POS</span><h3>{plan.name}</h3><p>{plan.description}</p><div className={styles.price}>{plan.price}<small> / mes</small></div>
        <ul>{plan.features.map(feature=><li key={feature}><span>✓</span>{feature}</li>)}</ul>
        <Link href="/login" className={plan.featured?styles.planButtonPrimary:styles.planButton}>Seleccionar plan</Link>
      </article>)}</div>
      <div className={styles.implementation}><div className={styles.implementationIcon}>▣</div><div className={styles.implementationCopy}><span className={styles.planLabel}>LICENCIA E IMPLEMENTACIÓN</span><h3>Implementación completa</h3><p>Configuración y puesta en marcha inicial de BOOM POS.</p></div><div className={styles.implementationPrice}><b>$599.000</b><span>pago único</span></div><ul><li>✓ Todas las funcionalidades habilitadas</li><li>✓ Configuración e implementación inicial</li><li>✓ Sin renovación mensual de licencia</li></ul></div>
      <p className={styles.priceNote}>Valores en pesos chilenos (CLP). La activación de planes pagados está sujeta a la confirmación del pago. Consulta las condiciones de implementación.</p>
    </section>

    <section className={styles.integration} id="integracion">
      <div><span className={styles.integrationMark}>SII</span><div><h3>Preparación para operación tributaria</h3><p>El proyecto contempla el módulo DTE / SII. La emisión tributaria oficial requiere completar y validar la integración antes de ofrecerla como disponible.</p><span className={styles.status}>Integración en preparación</span></div></div>
      <div><span className={styles.flowMark}>F</span><div><h3>Gestión de suscripciones</h3><p>El sistema incorpora flujo de suscripción y pago en línea. La activación de planes pagados depende de la confirmación de la transacción.</p><span className={styles.status}>Confirmación de pago requerida</span></div></div>
    </section>

    <section className={styles.finalCta} id="contacto"><div><span className={styles.eyebrow}>BOOM POS · SOMOS SOFTWARE</span><h2>Empieza a ordenar<br/>tu negocio hoy.</h2><p>Elige tu plan y comienza a gestionar tu operación comercial.</p></div><div className={styles.finalActions}><Link href="/login" className={styles.primary}>Crear mi cuenta <span>→</span></Link><a href="#planes" className={styles.darkLink}>Comparar planes</a></div></section>
    <footer className={styles.footer}><div className={styles.footerBrand}><Image src="/boom-pos-logo.png" alt="BOOM POS" width={132} height={58}/><span>Una solución de gestión comercial de Somos Software.</span></div><div className={styles.footerLinks}><a href="#funcionalidades">Funcionalidades</a><a href="#planes">Planes</a><Link href="/login">Acceso al sistema</Link></div><small>© {new Date().getFullYear()} Somos Software · BOOM POS</small></footer>
  </main>;
}
