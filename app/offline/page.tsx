export const metadata = { title: "BOOM POS sin conexión", robots: { index: false, follow: false } };

export default function OfflinePage() {
  return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"#f8fafc",fontFamily:"Arial,sans-serif",color:"#172033"}}>
    <section style={{maxWidth:440,width:"100%",background:"white",border:"1px solid #e2e8f0",borderRadius:18,padding:28,boxShadow:"0 12px 40px #0f172a0d",textAlign:"center"}}>
      <div style={{fontSize:42,marginBottom:12}} aria-hidden="true">📡</div>
      <h1 style={{fontSize:24,margin:"0 0 10px"}}>BOOM POS está sin conexión</h1>
      <p style={{fontSize:15,lineHeight:1.6,color:"#64748b",margin:"0 0 20px"}}>No fue posible recuperar esta pantalla desde el dispositivo. Activa internet y vuelve a intentar. Las ventas que ya estén guardadas localmente permanecen en la cola pendiente.</p>
      <a href="/" style={{display:"inline-block",padding:"11px 18px",borderRadius:10,background:"#f97316",color:"white",textDecoration:"none",fontWeight:700}}>Intentar abrir BOOM</a>
    </section>
  </main>;
}
