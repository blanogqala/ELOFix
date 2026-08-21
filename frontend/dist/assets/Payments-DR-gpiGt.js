import{r as i,j as e,L as _}from"./react-vendor-CZBNkCpJ.js";import{g as J,D as I,o as q,q as z,r as Y,v as U}from"./DashboardLayout-DT4pgr4Z.js";import{u as H,a as W,c as D}from"./index-s9l14rRz.js";import{B as p}from"./button--A3iC2uc.js";import{g as G,a as Q,d as K}from"./payments-CLMAvWs1.js";import{f as l}from"./formatCurrency-CRO3dMgJ.js";import{af as A,F as X,av as Z,a7 as ee,ax as f,o as $,p as se,ah as te,a2 as ae}from"./ui-vendor-B3UxyMYM.js";import{f as j}from"./format-Do3lzM-W.js";import{p as g}from"./parseISO-CRvDHTjd.js";import"./maplibre-CnMRh2yb.js";import"./export-tools-DEuGvHId.js";import"./uploadUrl-CB_XGD-q.js";import"./LegalFooterLinks-B5OiFTIj.js";import"./LegalAgreementCheckbox-D4vP8NtZ.js";import"./versions-D6FrCFdx.js";import"./firebase-DYp9ZZtL.js";import"./socket-D1aRZ6Ki.js";function re(n){const x=String(n.type||"").toLowerCase(),c=String(n.status||"").toLowerCase();return x==="refund"||c==="refunded"||c==="partially_refunded"}function ye(){const{user:n}=H(),{toast:x}=W(),[c,b]=i.useState("methods"),[N,S]=i.useState([]),[k,P]=i.useState([]),[L,T]=i.useState([]),[R,E]=i.useState(!0),[t,v]=i.useState(null),h=i.useCallback(async()=>{if(n)try{const[s,a,d]=await Promise.all([G(n.id),Q(n.id),J(n.id)]);S(s),P(a.sort((r,o)=>new Date(o.paidAt).getTime()-new Date(r.paidAt).getTime())),T(d.map(r=>({id:r.id,categoryName:r.categoryName})))}catch(s){console.error("Failed to load payment data:",s)}finally{E(!1)}},[n]);i.useEffect(()=>{n&&h()},[n,h]);const M=async s=>{if(n)try{await K(n.id,s),await h(),x({title:"Removed",description:"Legacy card metadata was deleted."})}catch{x({title:"Failed to remove",variant:"destructive"})}},B=s=>{const a=new Map;return s.forEach(d=>{const r=d.jobId;a.has(r)||a.set(r,[]),a.get(r).push(d)}),Array.from(a.entries()).map(([d,r])=>{var m,C;const o=L.find(u=>u.id===d),w=o?o.categoryName:((C=(m=r[0])==null?void 0:m.hardwareStores)==null?void 0:C[0])||`Order #${d.slice(-8)}`;return{jobId:d,label:w,invoices:r.sort((u,V)=>new Date(V.paidAt).getTime()-new Date(u.paidAt).getTime())}}).sort((d,r)=>{const o=Math.max(...d.invoices.map(m=>new Date(m.paidAt).getTime()));return Math.max(...r.invoices.map(m=>new Date(m.paidAt).getTime()))-o})},F=s=>{switch(s){case"paid":return e.jsx($,{className:"h-4 w-4 text-success"});case"partially_refunded":return e.jsx(ae,{className:"h-4 w-4 text-warning"});case"refunded":return e.jsx(f,{className:"h-4 w-4 text-primary"})}},y=s=>{switch(s){case"paid":return"Paid";case"partially_refunded":return"Partially Refunded";case"refunded":return"Refunded"}},O=s=>{const a=window.open("","_blank");if(!a)return;const d=`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invoice ${s.id}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
          h1 { color: #0A2540; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
          th { background: #f5f5f5; }
          .total { font-weight: bold; font-size: 1.2em; }
          .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
          .status { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; }
          .paid { background: #d4edda; color: #155724; }
          .refunded { background: #cce5ff; color: #004085; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>EloFix Invoice</h1>
            <p>Invoice ID: ${s.id}</p>
            <p>Reference: ${s.jobId}</p>
            ${s.driverName?`<p>Driver: ${s.driverName}</p>`:""}
            ${s.vehicleInfo?`<p>Vehicle: ${s.vehicleInfo}</p>`:""}
          </div>
          <div style="text-align: right;">
            <p>Date: ${j(g(s.paidAt),"PPP")}</p>
            <span class="status ${s.status}">${y(s.status)}</span>
          </div>
        </div>
        
        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${s.lineItems.map(r=>`
              <tr>
                <td>${r.description}${r.supplierName?` (${r.supplierName})`:""}</td>
                <td>${r.quantity}</td>
                <td>${l(r.unitPrice,{decimals:2})}</td>
                <td>${l(r.total,{decimals:2})}</td>
              </tr>
            `).join("")}
          </tbody>
          <tfoot>
            <tr class="total">
              <td colspan="3">Total</td>
              <td>${l(s.totalAmount,{decimals:2})}</td>
            </tr>
            ${s.refundedAmount?`
              <tr>
                <td colspan="3">Refunded</td>
                <td>-${l(s.refundedAmount,{decimals:2})}</td>
              </tr>
            `:""}
          </tfoot>
        </table>
        
        <p><strong>Payment Method:</strong> ${s.paymentMethod}${s.cardLast4?` ending in ${s.cardLast4}`:""}</p>
        
        <script>window.print();<\/script>
      </body>
      </html>
    `;a.document.write(d),a.document.close()};return R?e.jsx(I,{children:e.jsxs("div",{className:"space-y-6 animate-pulse",children:[e.jsx("div",{className:"h-8 w-48 bg-muted rounded"}),e.jsxs("div",{className:"flex gap-4",children:[e.jsx("div",{className:"h-10 w-24 bg-muted rounded"}),e.jsx("div",{className:"h-10 w-24 bg-muted rounded"})]}),e.jsx("div",{className:"card-elevated p-6",children:e.jsx("div",{className:"space-y-4",children:[1,2,3].map(s=>e.jsx("div",{className:"h-20 bg-muted rounded"},s))})})]})}):e.jsx(I,{children:e.jsxs("div",{className:"space-y-6 md:space-y-8 animate-fade-in",children:[e.jsxs("div",{className:"min-w-0",children:[e.jsx("h1",{className:"text-xl font-semibold sm:text-2xl md:text-3xl",children:"Payments"}),e.jsx("p",{className:"text-sm text-muted-foreground sm:text-base",children:"View invoices and payment method information"})]}),e.jsxs("div",{className:"flex flex-wrap gap-2 border-b border-border",children:[e.jsxs("button",{onClick:()=>b("methods"),className:D("px-4 py-2 font-medium text-sm transition-colors border-b-2 -mb-px",c==="methods"?"border-primary text-primary":"border-transparent text-muted-foreground hover:text-foreground"),children:[e.jsx(A,{className:"inline-block h-4 w-4 mr-2"}),"Payment methods"]}),e.jsxs("button",{onClick:()=>b("invoices"),className:D("px-4 py-2 font-medium text-sm transition-colors border-b-2 -mb-px",c==="invoices"?"border-primary text-primary":"border-transparent text-muted-foreground hover:text-foreground"),children:[e.jsx(X,{className:"inline-block h-4 w-4 mr-2"}),"Refunded Invoices"]})]}),c==="methods"&&e.jsxs("div",{className:"space-y-4",children:[e.jsx("div",{className:"card-elevated p-6 space-y-3",children:e.jsxs("div",{className:"flex items-start gap-3",children:[e.jsx(Z,{className:"h-5 w-5 text-muted-foreground shrink-0 mt-0.5"}),e.jsxs("div",{className:"space-y-2",children:[e.jsx("h3",{className:"font-semibold",children:"Payment methods"}),e.jsx("p",{className:"text-sm text-muted-foreground",children:"Saved payment methods will be managed securely through our payment service provider once card tokenisation is enabled."}),e.jsx("p",{className:"text-sm text-muted-foreground",children:"Sensitive card information is entered and processed through the applicable payment service provider. EloFix does not store CVV/CVC or full card numbers."})]})]})}),N.length>0&&e.jsxs("div",{className:"space-y-3",children:[e.jsx("p",{className:"text-xs text-muted-foreground",children:"Legacy display metadata only — not a vaulted payment method. These rows cannot be used to charge a card."}),N.map(s=>e.jsx("div",{className:"card-elevated p-4",children:e.jsxs("div",{className:"flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",children:[e.jsxs("div",{className:"flex min-w-0 items-center gap-3 sm:gap-4",children:[e.jsx("div",{className:"h-12 w-12 rounded-lg bg-muted flex items-center justify-center",children:e.jsx(A,{className:"h-5 w-5 text-muted-foreground"})}),e.jsxs("div",{children:[e.jsxs("p",{className:"font-medium capitalize",children:[s.brand," •••• ",s.last4]}),e.jsxs("p",{className:"text-sm text-muted-foreground",children:["Expires ",String(s.expiryMonth).padStart(2,"0"),"/",s.expiryYear]}),e.jsx("p",{className:"text-xs text-muted-foreground mt-1",children:"Status: LEGACY_METADATA_ONLY"})]})]}),e.jsx(p,{variant:"outline",size:"icon",className:"h-9 shrink-0 text-destructive hover:bg-destructive/10",onClick:()=>M(s.id),"aria-label":"Remove legacy card metadata",children:e.jsx(ee,{className:"h-4 w-4"})})]})},s.id))]})]}),c==="invoices"&&e.jsx("div",{className:"space-y-6",children:(()=>{const s=k.filter(re);return s.length===0?e.jsxs("div",{className:"card-elevated p-12 text-center",children:[e.jsx(f,{className:"h-12 w-12 text-muted-foreground mx-auto mb-4"}),e.jsx("h3",{className:"font-semibold mb-2",children:"No refunds yet"}),e.jsx("p",{className:"text-muted-foreground text-sm",children:"Completed refunds for your jobs will appear here"})]}):B(s).map(a=>e.jsxs("div",{children:[e.jsxs("div",{className:"mb-3 flex flex-wrap items-center justify-between gap-2",children:[e.jsx("h3",{className:"text-sm font-semibold",children:a.label}),a.jobId&&!String(a.jobId).startsWith("store-")?e.jsx(p,{variant:"link",className:"h-auto p-0 text-xs",asChild:!0,children:e.jsx(_,{to:`/user/jobs/${a.jobId}`,children:"Open job"})}):null]}),e.jsx("div",{className:"space-y-2",children:a.invoices.map(d=>e.jsx("div",{className:"card-elevated p-4 cursor-pointer hover:border-primary/30 transition-colors",onClick:()=>v(d),children:e.jsxs("div",{className:"flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",children:[e.jsxs("div",{className:"flex min-w-0 items-center gap-3 sm:gap-4",children:[e.jsx("div",{className:"flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success/10",children:e.jsx(f,{className:"h-4 w-4 text-success"})}),e.jsxs("div",{className:"min-w-0",children:[e.jsxs("p",{className:"truncate font-medium",children:["Refund · ",a.label]}),e.jsx("p",{className:"text-sm text-muted-foreground",children:j(g(d.paidAt),"PPP")})]})]}),e.jsxs("div",{className:"flex shrink-0 items-center justify-between gap-3 sm:justify-end",children:[e.jsxs("div",{className:"text-left sm:text-right",children:[e.jsxs("p",{className:"font-semibold text-success tabular-nums",children:["+",l(d.totalAmount,{decimals:2})]}),e.jsxs("div",{className:"flex items-center gap-1 text-xs text-success",children:[e.jsx($,{className:"h-3.5 w-3.5"}),e.jsx("span",{children:"Refunded"})]})]}),e.jsx(se,{className:"h-4 w-4 shrink-0 text-muted-foreground"})]})]})},d.id))})]},a.jobId))})()}),e.jsx(q,{open:!!t,onOpenChange:()=>v(null),children:e.jsxs(z,{className:"max-w-lg",children:[e.jsx(Y,{children:e.jsx(U,{children:"Invoice Details"})}),t&&e.jsxs("div",{className:"space-y-4 pt-2",children:[e.jsxs("div",{className:"flex items-center justify-between",children:[e.jsxs("div",{children:[e.jsx("p",{className:"text-sm text-muted-foreground",children:"Invoice ID"}),e.jsx("p",{className:"font-medium",children:t.id})]}),e.jsxs("div",{className:"flex items-center gap-2",children:[F(t.status),e.jsx("span",{className:"text-sm font-medium",children:y(t.status)})]})]}),e.jsxs("div",{className:"grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg",children:[e.jsxs("div",{children:[e.jsx("p",{className:"text-sm text-muted-foreground",children:"Job Reference"}),e.jsx("p",{className:"font-medium",children:t.jobId})]}),e.jsxs("div",{children:[e.jsx("p",{className:"text-sm text-muted-foreground",children:"Payment Date"}),e.jsx("p",{className:"font-medium",children:j(g(t.paidAt),"PPP")})]}),e.jsxs("div",{children:[e.jsx("p",{className:"text-sm text-muted-foreground",children:"Payment Method"}),e.jsx("p",{className:"font-medium",children:t.paymentMethod})]}),t.cardLast4&&e.jsxs("div",{children:[e.jsx("p",{className:"text-sm text-muted-foreground",children:"Card"}),e.jsxs("p",{className:"font-medium",children:["•••• ",t.cardLast4]})]})]}),e.jsxs("div",{children:[e.jsx("h4",{className:"font-medium mb-2",children:"Cost Breakdown"}),e.jsxs("div",{className:"space-y-2 border border-border rounded-lg p-3",children:[t.lineItems.map((s,a)=>e.jsxs("div",{className:"flex justify-between text-sm",children:[e.jsxs("span",{className:"text-muted-foreground",children:[s.description,s.quantity>1&&` (x${s.quantity})`]}),e.jsx("span",{children:l(s.total,{decimals:2})})]},a)),e.jsxs("div",{className:"border-t border-border pt-2 mt-2 flex justify-between font-medium",children:[e.jsx("span",{children:"Total"}),e.jsx("span",{children:l(t.totalAmount,{decimals:2})})]}),t.refundedAmount&&e.jsxs("div",{className:"flex justify-between text-success",children:[e.jsx("span",{children:"Refunded"}),e.jsxs("span",{children:["-",l(t.refundedAmount,{decimals:2})]})]})]})]}),t.hardwareStores&&t.hardwareStores.length>0&&e.jsxs("div",{children:[e.jsx("p",{className:"text-sm text-muted-foreground",children:"Hardware Stores"}),e.jsx("p",{className:"font-medium",children:t.hardwareStores.join(", ")})]}),t.driverName&&e.jsxs("div",{children:[e.jsx("p",{className:"text-sm text-muted-foreground",children:"Driver"}),e.jsx("p",{className:"font-medium",children:t.driverName})]}),t.vehicleInfo&&e.jsxs("div",{children:[e.jsx("p",{className:"text-sm text-muted-foreground",children:"Vehicle"}),e.jsx("p",{className:"font-medium",children:t.vehicleInfo})]}),e.jsxs(p,{className:"w-full",variant:"outline",onClick:()=>O(t),children:[e.jsx(te,{className:"mr-2 h-4 w-4"}),"Download Invoice"]})]})]})})]})})}export{ye as default};
