"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { AlertTriangle, ArrowDownToLine, Check, CheckCircle2, Eye, FileImage, FilePlus2, ImagePlus, Package, Plus, RotateCcw, Search, ShieldCheck, Upload, UserRound, X } from "lucide-react";
import { UserRole } from "@/contracts";
import type { PostgresSupply } from "@/contracts";
import { mockTechnicians } from "@/mocks";
import styles from "./supplies-control-demo.module.css";

const STORAGE_KEY = "fnet-insumos-demo-v1";
const WARNING_AFTER_DAYS = 14;
const TECHNICIAN_DEMO = "tech-01";
const mockSyncedRows: PostgresSupply[] = [
  { id: "demo-s-1", formulario: "FO-26-541064", grupo: "Insumos", indice: "1", quantity: 4, description: "Filtro de aire 50 × 50", provider: "Stock Claro", siteCode: "JU00068", siteName: "Libertador", status: "Aprobado", image: null, lastEditedAt: new Date().toISOString() },
  { id: "demo-s-2", formulario: "FO-26-541021", grupo: "Insumos", indice: "2", quantity: 30, description: "Precintos plásticos 3.6 × 150 mm", provider: "Stock Contratista", siteCode: "ST00072", siteName: "Salta", status: "Aprobado", image: null, lastEditedAt: new Date().toISOString() },
  { id: "demo-s-3", formulario: "FO-26-540992", grupo: "Insumos", indice: "1", quantity: 2, description: "Kit de limpieza de gabinete", provider: "Stock Contratista", siteCode: "ST00150", siteName: "Salta", status: "En revisión", image: null, lastEditedAt: new Date().toISOString() },
];

type Invoice = {
  id: string;
  number: string;
  supplier: string;
  date: string;
  amount: number;
  downloaded: boolean;
  downloadedAt?: string | null;
  uploadedToIntra: boolean;
  uploadedAt?: string | null;
  images: string[];
  createdAt: string;
};

type UseEvent = { id: string; quantity: number; forms: string[]; date: string };
type Handoff = {
  id: string;
  item: string;
  quantityGiven: number;
  remaining: number;
  technicianId: string;
  site: string;
  invoiceNumber: string;
  assignedAt: string;
  uses: UseEvent[];
};
type DemoState = { invoices: Invoice[]; handoffs: Handoff[] };

function isoDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function seedState(): DemoState {
  const invoices: Invoice[] = [
    { id: "inv-demo-1", number: "0003-00018452", supplier: "Electro Norte", date: isoDaysAgo(1).slice(0, 10), amount: 286450, downloaded: true, downloadedAt: isoDaysAgo(1), uploadedToIntra: false, uploadedAt: null, images: [], createdAt: isoDaysAgo(1) },
    { id: "inv-demo-2", number: "0002-00009176", supplier: "Repuestos Salta", date: isoDaysAgo(2).slice(0, 10), amount: 143890, downloaded: false, downloadedAt: null, uploadedToIntra: false, uploadedAt: null, images: [], createdAt: isoDaysAgo(2) },
    { id: "inv-demo-3", number: "0001-00006731", supplier: "Ferretería San Martín", date: isoDaysAgo(4).slice(0, 10), amount: 78500, downloaded: true, downloadedAt: isoDaysAgo(4), uploadedToIntra: true, uploadedAt: isoDaysAgo(3), images: [], createdAt: isoDaysAgo(4) },
    { id: "inv-demo-4", number: "0004-00001208", supplier: "Clima Técnica NOA", date: isoDaysAgo(6).slice(0, 10), amount: 392000, downloaded: false, downloadedAt: null, uploadedToIntra: true, uploadedAt: isoDaysAgo(5), images: [], createdAt: isoDaysAgo(6) },
    { id: "inv-demo-5", number: "0003-00018409", supplier: "Electro Norte", date: isoDaysAgo(8).slice(0, 10), amount: 95600, downloaded: true, downloadedAt: isoDaysAgo(7), uploadedToIntra: false, uploadedAt: null, images: [], createdAt: isoDaysAgo(8) },
  ];
  const handoffs: Handoff[] = [
    { id: "hand-demo-1", item: "Filtro de aire 50 × 50", quantityGiven: 4, remaining: 2, technicianId: "tech-01", site: "JU00068 · Libertador", invoiceNumber: "0003-00018452", assignedAt: isoDaysAgo(19), uses: [{ id: "use-demo-1", quantity: 2, forms: ["FO-26-541064", "FO-26-541102"], date: isoDaysAgo(15) }] },
    { id: "hand-demo-2", item: "Filtro de combustible KC24", quantityGiven: 3, remaining: 1, technicianId: "tech-02", site: "ST00072 · Salta", invoiceNumber: "0002-00009176", assignedAt: isoDaysAgo(9), uses: [{ id: "use-demo-2", quantity: 2, forms: ["FO-26-541087"], date: isoDaysAgo(6) }] },
    { id: "hand-demo-3", item: "Precintos plásticos", quantityGiven: 30, remaining: 30, technicianId: "tech-01", site: "JU00044 · Jujuy", invoiceNumber: "0001-00006731", assignedAt: isoDaysAgo(2), uses: [] },
    { id: "hand-demo-4", item: "Cable bipolar 6 mm", quantityGiven: 10, remaining: 0, technicianId: "tech-03", site: "ST00150 · Salta", invoiceNumber: "0004-00001208", assignedAt: isoDaysAgo(21), uses: [{ id: "use-demo-4", quantity: 10, forms: ["FO-26-540992", "FO-26-541021", "FO-26-541044"], date: isoDaysAgo(13) }] },
  ];
  return { invoices, handoffs };
}

function technicianName(id: string) { return mockTechnicians.find((technician) => technician.id === id)?.name ?? "Sin asignar"; }
function dayCount(date: string) { return Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000)); }
function formatDate(date: string) { return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(date)); }
function formatDateTime(date?: string | null) { return date ? new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(date)) : "Pendiente"; }
function formatMoney(amount: number) { return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(amount); }
function newId(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

async function imageToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Elegí un archivo de imagen.");
  const source = await createImageBitmap(file);
  const scale = Math.min(1, 1400 / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No se pudo preparar la imagen.");
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  source.close();
  return canvas.toDataURL("image/jpeg", 0.76);
}

export function SuppliesControlDemo({ role, rows, source }: { role: UserRole; rows: PostgresSupply[]; source: "mock" | "postgresql" }) {
  const [data, setData] = useState<DemoState>(() => seedState());
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<"control" | "sytex">("control");
  const [invoiceModal, setInvoiceModal] = useState(false);
  const [detailInvoiceId, setDetailInvoiceId] = useState<string | null>(null);
  const [handoffModal, setHandoffModal] = useState(false);
  const [useTarget, setUseTarget] = useState<Handoff | null>(null);
  const [invoiceQuery, setInvoiceQuery] = useState("");
  const [handoffQuery, setHandoffQuery] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const [form, setForm] = useState({ number: "", supplier: "", date: new Date().toISOString().slice(0, 10), amount: "", images: [] as string[] });
  const [handoffForm, setHandoffForm] = useState({ item: "", quantity: "", technicianId: "tech-01", site: "", invoiceNumber: "" });
  const [useForm, setUseForm] = useState({ quantity: "", forms: "" });
  const isTechnician = role === UserRole.TECHNICIAN;
  const rowsForRole = useMemo(() => isTechnician ? data.handoffs.filter((handoff) => handoff.technicianId === TECHNICIAN_DEMO) : data.handoffs, [data.handoffs, isTechnician]);
  const filteredInvoices = useMemo(() => data.invoices.filter((invoice) => `${invoice.number} ${invoice.supplier}`.toLowerCase().includes(invoiceQuery.toLowerCase())), [data.invoices, invoiceQuery]);
  const filteredHandoffs = useMemo(() => rowsForRole.filter((handoff) => `${handoff.item} ${handoff.site} ${technicianName(handoff.technicianId)}`.toLowerCase().includes(handoffQuery.toLowerCase())), [rowsForRole, handoffQuery]);
  const openHandoffs = rowsForRole.filter((handoff) => handoff.remaining > 0);
  const agingHandoffs = openHandoffs.filter((handoff) => dayCount(handoff.assignedAt) >= WARNING_AFTER_DAYS);
  const pendingDownload = data.invoices.filter((invoice) => !invoice.downloaded).length;
  const pendingUpload = data.invoices.filter((invoice) => !invoice.uploadedToIntra).length;
  const imageCount = data.invoices.reduce((sum, invoice) => sum + invoice.images.length, 0);
  const sytexRows = rows.length ? rows : source === "mock" ? mockSyncedRows : [];
  const detailInvoice = detailInvoiceId ? data.invoices.find((invoice) => invoice.id === detailInvoiceId) ?? null : null;

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as DemoState;
          if (Array.isArray(parsed.invoices) && Array.isArray(parsed.handoffs) && !cancelled) setData(parsed);
        }
      } catch { if (!cancelled) setNotice("No se pudo recuperar el estado demo guardado; se cargaron ejemplos iniciales."); }
      if (!cancelled) setReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
      catch { setError("El navegador se quedó sin espacio local. Quitá imágenes o reiniciá el demo."); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [data, ready]);

  async function handleImageFiles(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    setImageBusy(true);
    try {
      const converted = await Promise.all(Array.from(files).slice(0, 6).map(imageToDataUrl));
      setForm((current) => ({ ...current, images: [...current.images, ...converted].slice(0, 6) }));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudieron procesar las imágenes."); }
    finally { setImageBusy(false); }
  }

  async function attachImagesToInvoice(invoiceId: string, files: FileList | null) {
    if (!files?.length) return;
    const invoice = data.invoices.find((item) => item.id === invoiceId);
    if (!invoice) return;
    const available = Math.max(0, 6 - invoice.images.length);
    if (!available) { setError("Esta factura ya tiene el máximo de 6 imágenes."); return; }
    setError("");
    setImageBusy(true);
    try {
      const converted = await Promise.all(Array.from(files).slice(0, available).map(imageToDataUrl));
      setData((current) => ({ ...current, invoices: current.invoices.map((item) => item.id === invoiceId ? { ...item, images: [...item.images, ...converted] } : item) }));
      setNotice(`${converted.length} imagen${converted.length === 1 ? "" : "es"} adjuntada${converted.length === 1 ? "" : "s"} a la factura.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudieron procesar las imágenes."); }
    finally { setImageBusy(false); }
  }

  function saveInvoice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const duplicate = data.invoices.some((invoice) => invoice.number.trim().toLowerCase() === form.number.trim().toLowerCase() && invoice.supplier.trim().toLowerCase() === form.supplier.trim().toLowerCase());
    if (duplicate) { setError("Ya existe una factura con ese número y proveedor en este demo."); return; }
    const invoice: Invoice = { id: newId("inv"), number: form.number.trim(), supplier: form.supplier.trim(), date: form.date, amount: Number(form.amount), downloaded: false, downloadedAt: null, uploadedToIntra: false, uploadedAt: null, images: form.images, createdAt: new Date().toISOString() };
    setData((current) => ({ ...current, invoices: [invoice, ...current.invoices] }));
    setForm({ number: "", supplier: "", date: new Date().toISOString().slice(0, 10), amount: "", images: [] });
    setInvoiceModal(false);
    setNotice("Factura agregada: queda pendiente de descarga y carga en Intra.");
  }

  function saveHandoff(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const handoff: Handoff = { id: newId("hand"), item: handoffForm.item.trim(), quantityGiven: Number(handoffForm.quantity), remaining: Number(handoffForm.quantity), technicianId: handoffForm.technicianId, site: handoffForm.site.trim(), invoiceNumber: handoffForm.invoiceNumber.trim(), assignedAt: new Date().toISOString(), uses: [] };
    setData((current) => ({ ...current, handoffs: [handoff, ...current.handoffs] }));
    setHandoffForm({ item: "", quantity: "", technicianId: "tech-01", site: "", invoiceNumber: "" });
    setHandoffModal(false);
    setNotice("Entrega registrada para el técnico.");
  }

  function startUse(handoff: Handoff, allRemaining = false) {
    setUseTarget(handoff);
    setUseForm({ quantity: allRemaining ? String(handoff.remaining) : "", forms: "" });
    setError("");
  }

  function saveUse(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!useTarget) return;
    const quantity = Number(useForm.quantity);
    const forms = Array.from(new Set(useForm.forms.split(/[\n,;]+/).map((value) => value.trim()).filter(Boolean)));
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > useTarget.remaining) { setError(`Ingresá una cantidad mayor que 0 y hasta ${useTarget.remaining}.`); return; }
    if (!forms.length) { setError("Indicá al menos un formulario Sytex."); return; }
    const eventRecord: UseEvent = { id: newId("use"), quantity, forms, date: new Date().toISOString() };
    setData((current) => ({ ...current, handoffs: current.handoffs.map((handoff) => handoff.id === useTarget.id ? { ...handoff, remaining: Math.max(0, handoff.remaining - quantity), uses: [eventRecord, ...handoff.uses] } : handoff) }));
    setUseTarget(null);
    setNotice(quantity === useTarget.remaining ? "Uso registrado; el insumo quedó agotado." : "Consumo registrado con sus formularios.");
  }

  function toggleInvoiceStatus(id: string, field: "downloaded" | "uploadedToIntra") {
    const invoice = data.invoices.find((item) => item.id === id);
    if (!invoice) return;
    const label = field === "downloaded" ? "descarga" : "carga en Intra";
    const nextValue = !invoice[field];
    const timestampField = field === "downloaded" ? "downloadedAt" : "uploadedAt";
    const changedAt = nextValue ? new Date().toISOString() : null;
    setData((current) => ({ ...current, invoices: current.invoices.map((item) => item.id === id ? { ...item, [field]: nextValue, [timestampField]: changedAt } : item) }));
    setNotice(`${label.charAt(0).toUpperCase()}${label.slice(1)} marcada como ${invoice[field] ? "pendiente" : "completada"} en el demo.`);
  }

  function resetDemo() {
    const fresh = seedState();
    setData(fresh);
    setNotice("Se restauraron los datos de ejemplo.");
  }

  return <section className={styles.page}>
    <header className={styles.heading}>
      <div><div className={styles.eyebrow}><Package size={14} /> Insumos · Intra Claro</div><h1>Control de facturas e insumos</h1><p>Seguimiento operativo de documentos y materiales entregados a cada técnico.</p></div>
      <div className={styles.headingActions}><span className={styles.demoTag}><span /> DEMO LOCAL</span>{!isTechnician && <button className={styles.primaryButton} onClick={() => { setError(""); setInvoiceModal(true); }}><FilePlus2 size={16} /> Cargar factura</button>}</div>
    </header>
    <div className={styles.notice}><ShieldCheck size={16} /><span>Los cambios y las imágenes de este prototipo se guardan solo en este navegador. No sube documentos a Intra ni modifica Sytex.</span><button onClick={resetDemo} title="Restaurar datos de ejemplo"><RotateCcw size={14} /> Reiniciar demo</button></div>
    {notice && <div className={styles.successNotice}><CheckCircle2 size={15} />{notice}<button onClick={() => setNotice("")} aria-label="Cerrar aviso"><X size={14} /></button></div>}
    {error && !invoiceModal && !handoffModal && !useTarget && <div className={styles.errorNotice}><AlertTriangle size={15} />{error}<button onClick={() => setError("")} aria-label="Cerrar error"><X size={14} /></button></div>}
    <nav className={styles.tabs}><button className={tab === "control" ? styles.activeTab : ""} onClick={() => setTab("control")}>Control operativo</button><button className={tab === "sytex" ? styles.activeTab : ""} onClick={() => setTab("sytex")}>Registros Sytex <span>{sytexRows.length}</span></button></nav>
    {tab === "control" ? <>
      <div className={styles.metrics}>
        <Metric icon={<FileImage size={17} />} label="Facturas registradas" value={data.invoices.length} detail={`${imageCount} imágenes adjuntas`} />
        <Metric icon={<ArrowDownToLine size={17} />} label="Falta descargar" value={pendingDownload} detail="documentos pendientes" tone={pendingDownload ? "orange" : "green"} />
        <Metric icon={<Upload size={17} />} label="Falta cargar en Intra" value={pendingUpload} detail="marcadas pendientes" tone={pendingUpload ? "purple" : "green"} />
        <Metric icon={<Package size={17} />} label="Insumos en técnicos" value={openHandoffs.length} detail={`${agingHandoffs.length} requieren revisión`} tone={agingHandoffs.length ? "red" : "green"} />
      </div>
      {agingHandoffs.length > 0 && <div className={styles.agingBanner}><AlertTriangle size={18} /><div><strong>{agingHandoffs.length} entrega{agingHandoffs.length === 1 ? "" : "s"} con {WARNING_AFTER_DAYS} días o más sin cerrar</strong><span>Revisá con el técnico si el material sigue disponible o ya se usó en formularios.</span></div></div>}
      {!isTechnician && <section className={styles.panel}>
        <div className={styles.panelHeader}><div><div className={styles.eyebrow}>Documentación</div><h2>Facturas</h2><p>Controlá la descarga del comprobante y su carga en Intra Claro.</p></div><label className={styles.search}><Search size={15} /><input value={invoiceQuery} onChange={(event) => setInvoiceQuery(event.target.value)} placeholder="Buscar factura o proveedor" /></label></div>
        {filteredInvoices.length ? <div className={styles.invoiceList}>{filteredInvoices.map((invoice) => <article className={styles.invoiceCard} key={invoice.id}>
          <div className={styles.invoiceIcon}><FileImage size={19} /></div><div className={styles.invoiceMain}><div className={styles.invoiceTitle}><strong>FC {invoice.number}</strong><span className={styles.amount}>{formatMoney(invoice.amount)}</span></div><div className={styles.invoiceMeta}><span>{invoice.supplier}</span><span>·</span><span>{formatDate(invoice.date)}</span><span>·</span><span>{invoice.images.length} imagen{invoice.images.length === 1 ? "" : "es"}</span></div>
            <div className={styles.statuses}><Status done={invoice.downloaded} doneText="Descargada" pendingText="Pendiente descargar" /><Status done={invoice.uploadedToIntra} doneText="Cargada en Intra" pendingText="Pendiente cargar en Intra" /></div>
          </div><div className={styles.invoiceActions}><button className={styles.detailButton} onClick={() => { setError(""); setDetailInvoiceId(invoice.id); }}><Eye size={14} /> Ver detalle</button>{invoice.images.map((image, index) => <a key={`${invoice.id}-img-${index}`} href={image} download={`FC-${invoice.number}-imagen-${index + 1}.jpg`} className={styles.secondaryButton}><ArrowDownToLine size={14} /> Imagen {index + 1}</a>)}<button className={invoice.downloaded ? styles.doneButton : styles.secondaryButton} onClick={() => toggleInvoiceStatus(invoice.id, "downloaded")}>{invoice.downloaded ? <Check size={14} /> : <ArrowDownToLine size={14} />}{invoice.downloaded ? "Descargada" : "Marcar descargada"}</button><button className={invoice.uploadedToIntra ? styles.doneButton : styles.primaryButton} onClick={() => toggleInvoiceStatus(invoice.id, "uploadedToIntra")}>{invoice.uploadedToIntra ? <Check size={14} /> : <Upload size={14} />}{invoice.uploadedToIntra ? "Cargada en Intra" : "Marcar cargada"}</button></div>
        </article>)}</div> : <Empty title="No hay facturas con esa búsqueda" />}
      </section>}
      <section className={styles.panel}>
        <div className={styles.panelHeader}><div><div className={styles.eyebrow}>Custodia y consumo</div><h2>{isTechnician ? "Mis insumos" : "Insumos en poder de técnicos"}</h2><p>Quién tiene cada material, cuánto queda y en qué formularios se registró su uso.</p></div><div className={styles.panelActions}><label className={styles.search}><Search size={15} /><input value={handoffQuery} onChange={(event) => setHandoffQuery(event.target.value)} placeholder="Buscar insumo, sitio, técnico" /></label>{!isTechnician && <button className={styles.primaryButton} onClick={() => setHandoffModal(true)}><Plus size={15} /> Registrar entrega</button>}</div></div>
        {filteredHandoffs.length ? <div className={styles.handoffGrid}>{filteredHandoffs.map((handoff) => {
          const age = dayCount(handoff.assignedAt);
          const depleted = handoff.remaining === 0;
          const aging = !depleted && age >= WARNING_AFTER_DAYS;
          return <article className={`${styles.handoffCard} ${aging ? styles.agingCard : ""}`} key={handoff.id}>
            <div className={styles.handoffTop}><span className={styles.itemIcon}><Package size={17} /></span><span className={`${styles.pill} ${depleted ? styles.depletedPill : aging ? styles.warningPill : styles.activePill}`}>{depleted ? "Agotado" : aging ? `${age} días · revisar` : "En poder del técnico"}</span></div>
            <h3>{handoff.item}</h3><div className={styles.handoffFacts}><span><UserRound size={14} />{technicianName(handoff.technicianId)}</span><span>{handoff.site || "Sin sitio"}</span></div>
            <div className={styles.quantityBlock}><div><small>Entregado</small><strong>{handoff.quantityGiven}</strong></div><div className={styles.quantityDivider} /><div><small>Disponible</small><strong className={depleted ? styles.zero : ""}>{handoff.remaining}</strong></div><div className={styles.quantityDivider} /><div><small>Desde</small><strong className={styles.dateQuantity}>{formatDate(handoff.assignedAt)}</strong></div></div>
            <div className={styles.invoiceRef}>Factura {handoff.invoiceNumber || "sin referencia"}</div>
            {handoff.uses.length > 0 && <div className={styles.useHistory}><strong>Últimos formularios</strong><div>{handoff.uses.slice(0, 2).flatMap((use) => use.forms).slice(0, 5).map((formCode) => <span key={`${handoff.id}-${formCode}`}>{formCode}</span>)}</div><small>{handoff.uses.reduce((sum, use) => sum + use.quantity, 0)} unidades informadas como utilizadas</small></div>}
            {!depleted && <button className={styles.consumeButton} onClick={() => startUse(handoff)}><CheckCircle2 size={15} /> Registrar consumo / se acabó</button>}
          </article>;
        })}</div> : <Empty title="No hay insumos asignados" />}
      </section>
    </> : <section className={styles.panel}>
      <div className={styles.panelHeader}><div><div className={styles.eyebrow}>{source === "postgresql" ? "PostgreSQL · solo lectura" : "Datos de muestra"}</div><h2>Insumos sincronizados desde Sytex</h2><p>Registros de origen. La asignación al técnico y el seguimiento de consumo se administran en el control operativo.</p></div></div>
      {sytexRows.length ? <div className={styles.sytexTableWrap}><table className={styles.sytexTable}><thead><tr><th>Descripción</th><th>Cantidad</th><th>Sitio</th><th>Formulario</th><th>Proveedor</th><th>Estado</th></tr></thead><tbody>{sytexRows.slice(0, 100).map((row) => <tr key={`${row.formulario}-${row.grupo}-${row.indice}`}><td>{row.description ?? "Sin descripción"}</td><td>{row.quantity ?? "—"}</td><td>{row.siteName ?? row.siteCode ?? "—"}</td><td>{row.formulario}</td><td>{row.provider ?? "—"}</td><td>{row.status ?? "—"}</td></tr>)}</tbody></table></div> : <Empty title="No hay registros de Sytex disponibles" />}
      <div className={styles.sourceFootnote}><ShieldCheck size={14} /> Esta grilla sigue en solo lectura: las acciones del demo no alteran registros sincronizados.</div>
    </section>}

    {detailInvoice && <Modal title={`Factura ${detailInvoice.number}`} subtitle="Detalle del comprobante y seguimiento de carga." onClose={() => setDetailInvoiceId(null)}><div className={styles.detailBody}>
      <div className={styles.detailSummary}><strong>{formatMoney(detailInvoice.amount)}</strong><span>{detailInvoice.supplier}</span></div>
      <div className={styles.detailGrid}><div><small>Número</small><strong>FC {detailInvoice.number}</strong></div><div><small>Proveedor</small><strong>{detailInvoice.supplier}</strong></div><div><small>Fecha del comprobante</small><strong>{formatDate(detailInvoice.date)}</strong></div><div><small>Total</small><strong>{formatMoney(detailInvoice.amount)}</strong></div><div><small>Descarga</small><strong>{detailInvoice.downloaded ? `Descargada · ${formatDateTime(detailInvoice.downloadedAt ?? detailInvoice.createdAt)}` : "Pendiente"}</strong></div><div><small>Carga en Intra Claro</small><strong>{detailInvoice.uploadedToIntra ? `Cargada · ${formatDateTime(detailInvoice.uploadedAt ?? detailInvoice.createdAt)}` : "Pendiente"}</strong></div></div>
      <div className={styles.detailSectionHeading}><div><strong>Imágenes del comprobante</strong><small>{detailInvoice.images.length} de 6 adjuntas</small></div><label className={styles.detailAttachButton}><ImagePlus size={14} />{imageBusy ? "Procesando…" : "Adjuntar imágenes"}<input type="file" accept="image/*" multiple disabled={imageBusy || detailInvoice.images.length >= 6} onChange={(event) => { void attachImagesToInvoice(detailInvoice.id, event.target.files); event.currentTarget.value = ""; }} /></label></div>
      {detailInvoice.images.length ? <div className={styles.detailGallery}>{detailInvoice.images.map((image, index) => <article key={`${detailInvoice.id}-${index}`}><a href={image} target="_blank" rel="noreferrer" aria-label={`Abrir imagen ${index + 1}`}><Image src={image} alt={`Comprobante ${index + 1} de la factura ${detailInvoice.number}`} width={260} height={180} unoptimized /></a><div><span>Imagen {index + 1}</span><a href={image} download={`FC-${detailInvoice.number}-imagen-${index + 1}.jpg`}><ArrowDownToLine size={13} /> Descargar</a></div></article>)}</div> : <div className={styles.noImages}><FileImage size={21} /><strong>Esta factura todavía no tiene imágenes</strong><span>Adjuntá fotos o capturas del comprobante para consultarlas desde este detalle.</span></div>}
      {error && <p className={styles.formError}>{error}</p>}
      <div className={styles.detailStatusActions}><button className={detailInvoice.downloaded ? styles.doneButton : styles.secondaryButton} onClick={() => toggleInvoiceStatus(detailInvoice.id, "downloaded")}><ArrowDownToLine size={14} />{detailInvoice.downloaded ? "Descargada" : "Marcar descargada"}</button><button className={detailInvoice.uploadedToIntra ? styles.doneButton : styles.primaryButton} onClick={() => toggleInvoiceStatus(detailInvoice.id, "uploadedToIntra")}><Upload size={14} />{detailInvoice.uploadedToIntra ? "Cargada en Intra" : "Marcar cargada en Intra"}</button></div>
    </div></Modal>}

    {invoiceModal && <Modal title="Cargar factura" subtitle="Guardala en el tablero y adjuntá las imágenes del comprobante." onClose={() => setInvoiceModal(false)}><form className={styles.form} onSubmit={saveInvoice}>
      <label>Número de factura<input required value={form.number} onChange={(event) => setForm({ ...form, number: event.target.value })} placeholder="0003-00000000" /></label><label>Proveedor<input required value={form.supplier} onChange={(event) => setForm({ ...form, supplier: event.target.value })} placeholder="Nombre del proveedor" /></label><div className={styles.formRow}><label>Fecha<input type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label><label>Total (ARS)<input type="number" min="0.01" step="0.01" required value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label></div>
      <label className={styles.dropzone} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void handleImageFiles(event.dataTransfer.files); }}><ImagePlus size={20} /><strong>{imageBusy ? "Procesando imágenes…" : "Adjuntar imágenes"}</strong><small>Hasta 6 archivos. Se reducen para agilizar el prototipo.</small><input type="file" accept="image/*" multiple disabled={imageBusy} onChange={(event) => { void handleImageFiles(event.target.files); event.currentTarget.value = ""; }} /></label>{form.images.length > 0 && <div className={styles.imageStrip}>{form.images.map((image, index) => <div key={`${index}-${image.slice(0, 20)}`}><Image src={image} alt={`Factura adjunta ${index + 1}`} width={58} height={58} unoptimized /><button type="button" onClick={() => setForm((current) => ({ ...current, images: current.images.filter((_, imageIndex) => imageIndex !== index) }))} aria-label="Quitar imagen"><X size={13} /></button></div>)}</div>}
      {error && <p className={styles.formError}>{error}</p>}<div className={styles.formActions}><button className={styles.secondaryButton} type="button" onClick={() => setInvoiceModal(false)}>Cancelar</button><button className={styles.primaryButton} type="submit" disabled={imageBusy}><FilePlus2 size={15} /> Guardar factura</button></div>
    </form></Modal>}

    {handoffModal && <Modal title="Registrar entrega a técnico" subtitle="Indicá el material y quién queda a cargo." onClose={() => setHandoffModal(false)}><form className={styles.form} onSubmit={saveHandoff}>
      <label>Insumo<input required value={handoffForm.item} onChange={(event) => setHandoffForm({ ...handoffForm, item: event.target.value })} placeholder="Descripción del material" /></label><div className={styles.formRow}><label>Cantidad entregada<input type="number" min="0.001" step="0.001" required value={handoffForm.quantity} onChange={(event) => setHandoffForm({ ...handoffForm, quantity: event.target.value })} /></label><label>Técnico<select value={handoffForm.technicianId} onChange={(event) => setHandoffForm({ ...handoffForm, technicianId: event.target.value })}>{mockTechnicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.name}</option>)}</select></label></div>
      <label>Sitio / nodo<input value={handoffForm.site} onChange={(event) => setHandoffForm({ ...handoffForm, site: event.target.value })} placeholder="Ej. JU00068 · Libertador" /></label><label>Factura de origen<input value={handoffForm.invoiceNumber} onChange={(event) => setHandoffForm({ ...handoffForm, invoiceNumber: event.target.value })} placeholder="Opcional" /></label><div className={styles.formActions}><button className={styles.secondaryButton} type="button" onClick={() => setHandoffModal(false)}>Cancelar</button><button className={styles.primaryButton} type="submit"><UserRound size={15} /> Registrar entrega</button></div>
    </form></Modal>}

    {useTarget && <Modal title={`Registrar uso · ${useTarget.item}`} subtitle={`${useTarget.remaining} unidades disponibles · ${technicianName(useTarget.technicianId)}`} onClose={() => setUseTarget(null)}><form className={styles.form} onSubmit={saveUse}>
      <label>Cantidad utilizada<input type="number" min="0.001" max={useTarget.remaining} step="0.001" required value={useForm.quantity} onChange={(event) => setUseForm({ ...useForm, quantity: event.target.value })} /><small className={styles.helpText}>Si el técnico informa que se acabó, registrá toda la cantidad restante.</small></label><label>Formularios Sytex<input required value={useForm.forms} onChange={(event) => setUseForm({ ...useForm, forms: event.target.value })} placeholder="FO-26-541064, FO-26-541102" /><small className={styles.helpText}>Podés indicar uno o varios, separados por coma o en líneas distintas.</small></label>
      {error && <p className={styles.formError}>{error}</p>}<div className={styles.formActions}><button type="button" className={styles.secondaryButton} onClick={() => setUseTarget(null)}>Cancelar</button><button type="button" className={styles.secondaryButton} onClick={() => startUse(useTarget, true)}>Se acabó todo</button><button className={styles.primaryButton} type="submit"><CheckCircle2 size={15} /> Guardar consumo</button></div>
    </form></Modal>}
  </section>;
}

function Metric({ icon, label, value, detail, tone = "blue" }: { icon: React.ReactNode; label: string; value: number; detail: string; tone?: string }) {
  return <article className={`${styles.metric} ${styles[`metric_${tone}`]}`}><div className={styles.metricHead}><span>{label}</span><i>{icon}</i></div><strong>{value}</strong><small>{detail}</small></article>;
}
function Status({ done, doneText, pendingText }: { done: boolean; doneText: string; pendingText: string }) { return <span className={`${styles.status} ${done ? styles.statusDone : styles.statusPending}`}><span />{done ? doneText : pendingText}</span>; }
function Empty({ title }: { title: string }) { return <div className={styles.empty}><Package size={23} /><strong>{title}</strong><span>Los datos agregados desde el demo aparecerán en esta vista.</span></div>; }
function Modal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) { return <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={`${styles.modal} ${title.startsWith("Factura ") ? styles.modalWide : ""}`} role="dialog" aria-modal="true" aria-label={title}><header><div><h2>{title}</h2><p>{subtitle}</p></div><button className={styles.closeButton} onClick={onClose} type="button" aria-label="Cerrar"><X size={18} /></button></header>{children}</section></div>; }
