import {useState,useEffect,useRef} from 'react'
import {LayoutDashboard,FolderOpen,FilePlus,FileText,ClipboardCheck,Settings as Cog,ShieldCheck,Bell,CheckCircle2,AlertTriangle,XCircle,Eye,Upload,Trash2,Printer,Play,Loader2,Menu,LogOut,Building2,Flame,ScrollText,FileSearch,Clock,MessageSquare,RefreshCw,Send,Sparkles,X,Download} from 'lucide-react'
import demo from './demo.json'

const API=(import.meta.env.VITE_API_URL||'')+'/api' // empty in local dev (Vite proxy), full Render URL in production
const ST={Passed:[CheckCircle2,'ok'],Warning:[AlertTriangle,'warn'],Failed:[XCircle,'bad'],'Needs Review':[Eye,'rev']}
const DOCS={application:['Institution Application Form',FileText,'Application with institution details'],registration:['Registration Certificate',ScrollText,'Institution registration proof'],building:['Building Completion Certificate',Building2,'Occupancy / completion certificate'],fire:['Fire Safety Certificate',Flame,'Current fire safety clearance']}
const NAV=[['overview','Overview',LayoutDashboard],['apps','Applications',FolderOpen],['new','New Application',FilePlus],['reports','Verification Reports',FileText],['settings','Settings',Cog]]
const OFFICER=NAV.filter(n=>n[0]!=='new')
const APPLICANT=[['mine','My Applications',FolderOpen],['new','Submit Application',FilePlus]]
const store={get:k=>{try{return localStorage.getItem(k)}catch{return null}},set:(k,v)=>{try{localStorage.setItem(k,v)}catch{}}}
const DISC='Prototype verification based on configured demo rules. This report does not constitute official AICTE approval or proof of document authenticity.'
const RULES=['All four document categories must be present','Application form mandatory fields must be filled','Institution name must match across documents','Registration number must match (application vs certificate)','Fire safety certificate must not be expired on the reference date (2026-10-22)','Issuer / digital-signature verification: not implemented (manual review)']
const flagged=a=>a.findings.filter(f=>['Failed','Warning'].includes(f.status)&&f.resolution==='open').length
const Badge=({s})=>{const [I,c]=ST[s];return <span className={'badge '+c}><I size={14}/>{s}</span>}
const vstat=a=>!a.findings.length?['Not verified','mute']:flagged(a)?['Issues flagged','bad']:['No issues found','ok']

let TOKEN=''
async function call(p,o={}){try{const r=await fetch(API+p,{...o,headers:{...o.headers,...(TOKEN?{Authorization:'Bearer '+TOKEN}:{})}});if(r.status>=500)return null;const j=await r.json();if(r.status===401&&TOKEN){store.set('tg_auth','');location.reload()}if(!r.ok)throw new Error(typeof j.detail==='string'?j.detail:'Request failed');return j}catch(e){if(e instanceof TypeError||e instanceof SyntaxError)return null;throw e}}
const send=(p,m,b)=>call(p,{method:m,headers:{'Content-Type':'application/json'},body:JSON.stringify(b)})

function Table({list,onOpen,label}){
  const [q,setQ]=useState(''),[st,setSt]=useState('All')
  const rows=list.filter(a=>(st==='All'||a.review===st)&&(a.id+a.institution).toLowerCase().includes(q.toLowerCase()))
  return <div className="card">
    <div className="row"><input aria-label="Search" placeholder="Search by application ID or institution" value={q} onChange={e=>setQ(e.target.value)}/>
      <select aria-label="Filter by review status" value={st} onChange={e=>setSt(e.target.value)}>{['All','Pending review','In review','Action required','Resolved'].map(s=><option key={s}>{s}</option>)}</select></div>
    <div className="scroll"><table><thead><tr><th>Application ID</th><th>Institution</th><th>Submitted</th><th>Verification</th><th>Review</th><th>Flagged</th><th></th></tr></thead><tbody>
      {rows.map(a=>{const [v,c]=vstat(a);return <tr key={a.id} tabIndex={0} onClick={()=>onOpen(a.id)} onKeyDown={e=>e.key==='Enter'&&onOpen(a.id)}>
        <td>{a.id}</td><td>{a.institution}</td><td>{a.submitted}</td><td><span className={'badge '+c}>{v}</span></td><td>{a.review}</td><td>{flagged(a)}</td>
        <td><button className="btn sm" onClick={e=>{e.stopPropagation();onOpen(a.id)}}>{label}</button></td></tr>})}
      {!rows.length&&<tr><td colSpan="7">No applications match. Clear the search or filter, or create a new application.</td></tr>}
    </tbody></table></div></div>
}

function Overview({apps,open,setView}){
  const c=[['Total applications',apps.length],['Awaiting review',apps.filter(a=>a.review==='Pending review').length],['Waiting on applicant',apps.filter(a=>a.review==='Action required').length],['With flagged issues',apps.filter(a=>flagged(a)>0).length],['Reviewed',apps.filter(a=>a.review==='Resolved').length]]
  return <>
    <div className="cards">{c.map(([l,n])=><div className="card" key={l}><b>{n}</b><span>{l}</span></div>)}</div>
    <div className="row"><span>Try a sample case:</span>
      <button className="btn" onClick={()=>open('TG-2026-0001')}>Case A: clean application</button>
      <button className="btn" onClick={()=>open('TG-2026-0002')}>Case B: application with issues</button>
      <button className="btn pri" onClick={()=>setView('new')}><FilePlus size={16}/>New application</button></div>
    <Table list={apps} onOpen={open} label="View"/></>
}

function NewApp({live,onCreated,say,open}){
  const [step,setStep]=useState(0),[f,setF]=useState({institution:'',address:'',program:'',representative:''}),[files,setFiles]=useState({}),[err,setErr]=useState({}),[busy,setBusy]=useState(false),[done,setDone]=useState(null),[over,setOver]=useState(''),[prog,setProg]=useState({})
  const pick=(k,file)=>{if(!file)return
    const bad=!/\.(pdf|jpe?g|png)$/i.test(file.name)?'Only PDF, JPG or PNG files are accepted.':file.size>10e6?'File is larger than 10 MB.':''
    setErr(e=>({...e,[k]:bad}));if(bad)return;setProg(p=>({...p,[k]:0}));const r=new FileReader();r.onprogress=e=>e.lengthComputable&&setProg(p=>({...p,[k]:Math.round(e.loaded/e.total*100)}));r.onload=()=>{setFiles(x=>({...x,[k]:file}));setProg(p=>({...p,[k]:null}))};r.readAsArrayBuffer(file)}
  const missing=Object.keys(DOCS).filter(k=>!files[k])
  const next=()=>{if(step===0){const e={};Object.keys(f).forEach(k=>{if(!f[k].trim())e[k]='Required'});setErr(e);if(Object.keys(e).length)return}
    if(step===1&&missing.length){say('Upload all four documents to continue');return}setStep(step+1)}
  const submit=async()=>{setBusy(true)
    try{const fd=new FormData();Object.entries(f).forEach(([k,v])=>fd.append(k,v));Object.entries(files).forEach(([k,v])=>fd.append(k,v))
      const a=await call('/applications',{method:'POST',body:fd})
      if(!a)throw new Error('Backend is not running. Start FastAPI to submit applications (demo mode is read-only).')
      onCreated(a);setDone(a);setStep(3)}catch(e){say(e.message)}setBusy(false)}
  return <div className="card">
    <div className="steps">{['1 Details','2 Documents','3 Review','4 Done'].map((s,i)=><span key={s} className={i===step?'on':''}>{s}</span>)}</div>
    {step===0&&<div className="form">{[['institution','Institution name'],['address','Address'],['program','Proposed program / course'],['representative','Authorized representative']].map(([k,l])=>
      <div key={k}><label htmlFor={k}>{l}</label><input id={k} value={f[k]} onChange={e=>setF({...f,[k]:e.target.value})}/>{err[k]&&<div className="err">{err[k]}</div>}</div>)}
      <div><label>Application ID</label><input disabled value="Generated on submit"/></div></div>}
    {step===1&&<div className="grid4">{Object.entries(DOCS).map(([k,[t,I,d]])=>
      <div key={k} className={'drop'+(over===k?' over':'')} onDragOver={e=>{e.preventDefault();setOver(k)}} onDragLeave={()=>setOver('')} onDrop={e=>{e.preventDefault();setOver('');pick(k,e.dataTransfer.files[0])}}>
        <I size={22}/><b> {t}</b><p style={{margin:'4px 0',fontSize:13,color:'#64748b'}}>{d}. PDF, JPG or PNG, up to 10 MB.</p>
        {prog[k]!=null?<p><Loader2 className="spin" size={14}/> Reading file… {prog[k]}%<br/><progress max="100" value={prog[k]}/></p>:files[k]?<><span className="badge ok"><CheckCircle2 size={14}/>Ready</span><p style={{fontSize:13}}>{files[k].name} ({Math.round(files[k].size/1024)} KB)</p>
          <label className="btn sm" style={{cursor:'pointer'}}>Replace<input hidden type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>pick(k,e.target.files[0])}/></label>{' '}
          <button className="btn sm" onClick={()=>setFiles(x=>{const y={...x};delete y[k];return y})}><Trash2 size={14}/>Remove</button></>
        :<label className="btn sm" style={{cursor:'pointer'}}><Upload size={14}/>Browse files<input hidden type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>pick(k,e.target.files[0])}/></label>}
        {err[k]&&<div className="err">{err[k]}</div>}</div>)}</div>}
    {step===2&&<><p><b>{f.institution}</b><br/>{f.address}<br/>{f.program} · {f.representative}</p>
      {Object.entries(DOCS).map(([k,[t]])=><p key={k}>{files[k]?<span className="badge ok"><CheckCircle2 size={14}/>{t}: {files[k].name}</span>:<span className="badge bad"><XCircle size={14}/>{t}: missing</span>}</p>)}
      {!live&&<p className="err">Backend not reachable: submission needs the FastAPI server.</p>}</>}
    {step===3&&done&&<><h2><CheckCircle2 color="#16874a"/> Application submitted</h2><p>Application ID: <b>{done.id}</b>. Verification runs automatically and a review officer will review it.</p><button className="btn pri" onClick={()=>open(done.id)}>Open application</button></>}
    {step<3&&<div className="row" style={{marginTop:16}}>{step>0&&<button className="btn" onClick={()=>setStep(step-1)}>Back</button>}
      {step<2?<button className="btn pri" onClick={next}>Next</button>:<button className="btn pri" disabled={busy||missing.length>0} onClick={submit}>{busy?<Loader2 className="spin" size={16}/>:null}Submit application</button>}</div>}
  </div>
}

function Detail({a,live,patch,say,ask,report}){
  const [d,setD]=useState('application'),[busy,setBusy]=useState(false)
  const doc=a.documents[d],groups=[...new Set(a.findings.map(f=>f.group))]
  const url=`${API}/applications/${a.id}/documents/${d}/file?token=${TOKEN}`
  const run=async()=>{setBusy(true)
    try{const r=await call(`/applications/${a.id}/verify`,{method:'POST'});if(r)patch(a.id,()=>r);else{await new Promise(r=>setTimeout(r,1400));say('Demo mode: showing precomputed results')}}catch(e){say(e.message)}setBusy(false)}
  const edit=(field,value)=>{patch(a.id,x=>({...x,documents:{...x.documents,[d]:{...x.documents[d],fields:{...x.documents[d].fields,[field]:value}}}}));send(`/applications/${a.id}/fields`,'PATCH',{doc:d,field,value});say('Field corrected. Re-run verification to update findings.')}
  const act=(f,resolution)=>{const res=resolution==='resolved'
    ask(res?'Resolve this finding? The applicant will be notified to update the document and resubmit. Add an optional message for them:':'Dismiss this finding as a false positive?',(message='')=>{
      patch(a.id,x=>({...x,review:res?'Action required':x.review==='Action required'?x.review:'In review',findings:x.findings.map(g=>g.id===f.id?{...g,resolution}:g),
        requests:res?[...(x.requests||[]),{id:'local'+f.id,finding:f.id,doc:f.doc,doc_title:(DOCS[f.doc]||['your documents'])[0],status:'open',message:message.trim()||'Please check this document, correct the issue and upload an updated copy.'}]:x.requests}))
      send(`/applications/${a.id}/findings/${f.id}`,'PATCH',{resolution,message});say(res?'Applicant notified to update documents and resubmit':'Finding updated')},res)}
  const reviewed=()=>ask('Mark this application as reviewed? Its review status will change to Resolved and the applicant will see it.',async()=>{
    try{await send(`/applications/${a.id}`,'PATCH',{review:'Resolved'});patch(a.id,x=>({...x,review:'Resolved'}));say('Application marked as reviewed')}catch(e){say(e.message)}})
  const count=s=>a.findings.filter(f=>f.status===s).length
  return <>
    <div className="row"><b>{a.id}</b><span>{a.institution}</span><span className="badge mute">{a.review}</span><div className="grow"/>
      <button className="btn pri" onClick={run} disabled={busy}>{busy?<Loader2 className="spin" size={16}/>:<Play size={16}/>}{busy?'Verifying…':'Run verification'}</button>
      <button className="btn" onClick={report} disabled={!a.findings.length}><FileText size={16}/>View report</button>
      <button className="btn" onClick={reviewed} disabled={!a.findings.length||a.review==='Resolved'||a.review==='Action required'} title={a.review==='Action required'?'Waiting for the applicant to resubmit':''}><ClipboardCheck size={16}/>Mark reviewed</button></div>
    {(a.requests||[]).some(r=>r.status==='open')&&<div className="card" style={{borderLeft:'4px solid #d97706'}}>Waiting for the applicant to update and resubmit: {(a.requests||[]).filter(r=>r.status==='open').map(r=>r.doc_title).join(', ')}.</div>}
    {a.findings.length>0&&<div className="card">Result: {count('Passed')} passed · {count('Warning')} warnings · {count('Failed')} failed · {count('Needs Review')} need review.{flagged(a)===0&&' No issues found by the configured checks. This is not proof of authenticity.'}</div>}
    <div className="split"><div>
      <div className="card"><h3 style={{marginTop:0}}>Documents</h3>
        {Object.entries(DOCS).map(([k,[t,I]])=><button key={k} className={'doc'+(d===k?' on':'')} onClick={()=>setD(k)}><I size={18}/><span>{t}<small>{a.documents[k]?`${a.documents[k].filename} · ${/\.pdf$/i.test(a.documents[k].filename)?'PDF':'Image'} · Uploaded`:'Not uploaded'}</small></span></button>)}</div>
      <div className="card"><h3 style={{marginTop:0}}>{DOCS[d][0]}</h3>
        {!doc?<p>This document is missing. Upload it from a new application.</p>:<>
          {doc.synthetic&&<p className="disc">Synthetic Demo Document — Not an Official Certificate.</p>}
          {doc.file&&live&&(/\.pdf$/i.test(doc.filename)?<iframe title="Preview" src={url} style={{width:'100%',height:300,border:'1px solid #e2e8f0'}}/>:<img alt="Preview" src={url} style={{maxWidth:'100%'}}/>)}
          <h4>Extracted fields (editable)</h4>
          {['institution_name','registration_number','address','program','representative','issue_date','valid_until'].filter(k=>k in doc.fields||d==='application').map(k=>
            <div className="field" key={d+k+doc.fields[k]}><label htmlFor={d+k}>{k.replace(/_/g,' ')}</label>
              <input id={d+k} defaultValue={doc.fields[k]||''} placeholder="Unable to extract — manual review required" onBlur={e=>e.target.value!==(doc.fields[k]||'')&&edit(k,e.target.value)}/></div>)}</>}</div>
      <div className="card"><label htmlFor="notes"><b>Reviewer notes</b></label><textarea id="notes" rows="3" defaultValue={a.notes} onBlur={e=>{patch(a.id,x=>({...x,notes:e.target.value}));send(`/applications/${a.id}`,'PATCH',{notes:e.target.value})}}/></div>
    </div><div className="card"><h3 style={{marginTop:0}}>Verification results</h3>
      {!a.findings.length&&<p>No verification has been run yet. Select Run verification.</p>}
      {groups.map(g=><div key={g}><b>{g}</b>{a.findings.filter(f=>f.group===g).map(f=><div key={f.id} className={'finding '+ST[f.status][1]}>
        <Badge s={f.status}/> <b>{f.title}</b>{f.resolution!=='open'&&<span className="badge mute">{f.resolution}</span>}
        <p>{f.detail}{f.status==='Failed'&&' Potential inconsistency detected — manual review required.'}</p>
        <Evidence text={f.evidence}/>
        <div className="row" style={{margin:'8px 0 0'}}>{DOCS[f.doc]&&<button className="btn sm" onClick={()=>setD(f.doc)}><Eye size={14}/>View source</button>}
          {['Failed','Warning','Needs Review'].includes(f.status)&&f.resolution==='open'&&<><button className="btn sm" onClick={()=>act(f,'resolved')}>Resolve</button><button className="btn sm" onClick={()=>act(f,'dismissed')}>Dismiss false positive</button></>}</div></div>)}</div>)}
    </div></div></>
}

function Evidence({text}){
  const parts=(text||'').split(/;\s*/).filter(Boolean)
  const rows=parts.map(x=>{const m=x.match(/^(.+?)(?:\s=\s|:\s)(.+)$/);return m?{k:m[1],v:m[2]}:{v:x}})
  const norm=v=>v.toLowerCase().replace(/[^a-z0-9]/g,'')
  const kv=rows.length>1&&rows.every(r=>r.k)
  let odd=new Set()
  if(kv){const cnt={};rows.forEach(r=>{const n=norm(r.v);cnt[n]=(cnt[n]||0)+1})
    const vals=Object.values(cnt),max=Math.max(...vals)
    if(vals.length>1&&vals.filter(c=>c===max).length===1)rows.forEach((r,i)=>{if(cnt[norm(r.v)]<max)odd.add(i)})}
  if(!rows.length)return null
  return <div className="evid"><div className="evid-title"><FileSearch size={14}/>Evidence</div>
    <div className="evid-rows">{rows.map((r,i)=>{
      const chips=r.k&&/^present$/i.test(r.k)?r.v.split(/,\s*/):null
      return <div key={i} className={'evid-row'+(odd.has(i)?' odd':'')}>
        {r.k&&<span className="evid-k">{r.k}</span>}
        <span className="evid-v">{chips?chips.map(c=><span className="chip" key={c}><CheckCircle2 size={12}/>{c}</span>):r.v}
          {odd.has(i)&&<span className="badge bad evid-tag"><XCircle size={12}/>Differs</span>}</span></div>})}</div></div>
}

function Stamp({id,date}){
  return <svg className="stamp" width="150" height="150" viewBox="0 0 150 150" role="img" aria-label="TrustGrid prototype seal">
    <defs><path id="stc" d="M75 75 m-55 0 a55 55 0 1 1 110 0 a55 55 0 1 1 -110 0"/></defs>
    <circle cx="75" cy="75" r="71" fill="none" stroke="#12285a" strokeWidth="3"/><circle cx="75" cy="75" r="44" fill="none" stroke="#0e9aa7" strokeWidth="1.5"/>
    <text fontSize="9.5" fontWeight="700" letterSpacing="1.4" fill="#12285a"><textPath href="#stc">TRUSTGRID · PROTOTYPE SEAL · NOT OFFICIAL ·</textPath></text>
    <path d="M75 46l15 5v10c0 9-6.5 15-15 18.5C66.500 76 60 70 60 61V51l15-5z" fill="none" stroke="#0e9aa7" strokeWidth="2"/>
    <text x="75" y="95" textAnchor="middle" fontSize="12" fontWeight="700" fill="#12285a">SEALED</text>
    <text x="75" y="106" textAnchor="middle" fontSize="7.5" fill="#475569">{date}</text><text x="75" y="115" textAnchor="middle" fontSize="7.5" fill="#475569">{id}</text></svg>
}

function Report({a,patch,say,ask}){
  const n=s=>a.findings.filter(f=>f.status===s).length,s=a.seal,[chk,setChk]=useState(null),[busy,setBusy]=useState('')
  const verify=async()=>{setBusy('verify');try{setChk(await call(`/applications/${a.id}/seal/verify`))}catch(e){say(e.message)}setBusy('')}
  useEffect(()=>{setChk(null);if(s)call(`/applications/${a.id}/seal/verify`).then(setChk).catch(()=>{})},[a.id,s&&s.signature])
  const seal=()=>ask(s?'Seal this report again? A new signature will replace the old one.':'Seal this report? The findings, notes and document fingerprints will be signed, and any later change will be detected.',async()=>{
    setBusy('seal');try{const r=await send(`/applications/${a.id}/seal`,'POST');if(r){patch(a.id,()=>r);say('Report sealed')}else say('Sealing needs the live backend.')}catch(e){say(e.message)}setBusy('')})
  const dl=()=>{const u=URL.createObjectURL(new Blob([JSON.stringify({application:a.id,seal:s},null,1)],{type:'application/json'}));const l=document.createElement('a');l.href=u;l.download=a.id+'_seal.json';l.click();URL.revokeObjectURL(u)}
  const ok=chk&&chk.signature_valid&&chk.unchanged_since_sealed
  return <div className="card"><div className="row noprint"><button className="btn pri" onClick={()=>window.print()}><Printer size={16}/>Print / save as PDF</button>
      <button className="btn" disabled={!a.findings.length||busy==='seal'} onClick={seal}>{busy==='seal'?<Loader2 className="spin" size={16}/>:<ShieldCheck size={16}/>}{s?'Seal again':'Seal report'}</button>
      {s&&<><button className="btn" disabled={busy==='verify'} onClick={verify}><CheckCircle2 size={16}/>Verify seal</button><button className="btn" onClick={dl}><Download size={16}/>Download seal file</button></>}</div>
    <h2>TrustGrid Verification Report</h2>
    <p><b>Application:</b> {a.id}<br/><b>Institution:</b> {a.institution}<br/><b>Verification date:</b> 2026-10-22 (reference date)<br/><b>Documents processed:</b> {Object.keys(a.documents).length} of 4<br/>
    <b>Checks:</b> {a.findings.length} total · {n('Passed')} passed · {n('Warning')} warnings · {n('Failed')} failed · {n('Needs Review')} need review<br/><b>Review status:</b> {a.review}</p>
    {a.findings.map(f=><div key={f.id} className={'finding '+ST[f.status][1]}><Badge s={f.status}/> <b>{f.title}</b> ({f.resolution}) <p>{f.detail}</p><Evidence text={f.evidence}/></div>)}
    <p><b>Reviewer notes:</b> {a.notes||'None'}</p>
    <p className="disc">{DISC} Issuer verification and verification of signatures on the submitted documents are not implemented.</p>
    {s?<div className="seal"><Stamp id={a.id} date={s.signed_at.slice(0,10)}/><div className="seal-d"><b>Post-quantum digital seal</b>{' '}
      {chk?<span className={'badge '+(ok?'ok':chk.signature_valid?'warn':'bad')}>{ok?'Seal valid · report unchanged':chk.signature_valid?'Report changed since sealing':'Signature invalid'}</span>:<span className="badge mute">Checking…</span>}
      <dl><dt>Algorithm</dt><dd>{s.algorithm}</dd><dt>Key fingerprint</dt><dd>{s.fingerprint.slice(0,32)}</dd><dt>Signed (UTC)</dt><dd>{s.signed_at}</dd><dt>Report hash</dt><dd>{s.payload_sha256.slice(0,32)}…</dd><dt>Signature</dt><dd>{s.signature.slice(0,48)}…</dd></dl>
      <p className="note">Signed with a NIST-standard post-quantum signature scheme (ML-DSA) so the seal can stay checkable for many years, even against future quantum computers. It proves this report has not changed since TrustGrid signed it. It does not prove that any document is genuine. This is a prototype seal, not an official AICTE seal.</p></div></div>
     :<p className="note">This report has not been sealed yet.</p>}</div>
}

function SettingsPage({live}){
  return <><div className="card"><h3>Profile</h3><p>Verification Officer (demo user) · officer@example.org</p>
    <p>Mode: <span className={'badge '+(live?'ok':'warn')}>{live?'Live backend connected':'Demo mode'}</span></p></div>
    <div className="card"><h3>Configured validation rules (predefined, read-only)</h3><ul>{RULES.map(r=><li key={r}>{r}</li>)}</ul></div>
    <div className="card"><h3>Document checklist</h3><ul>{Object.values(DOCS).map(d=><li key={d[0]}>{d[0]}</li>)}</ul></div></>
}

function Login({onAuth}){
  const [tab,setTab]=useState('applicant'),[mode,setMode]=useState('login'),[f,setF]=useState({name:'',email:'',password:''}),[err,setErr]=useState(''),[busy,setBusy]=useState(false)
  const reg=tab==='applicant'&&mode==='register',set=k=>e=>setF({...f,[k]:e.target.value})
  const submit=async e=>{e.preventDefault();setErr('');setBusy(true)
    try{const r=await send(reg?'/auth/register':'/auth/login','POST',f)
      if(!r)throw new Error('Backend not reachable. On the free Render plan it can take about a minute to wake up. Try again shortly.')
      if(r.user.role!==tab)throw new Error(tab==='officer'?'This is not an officer account.':'Officers must sign in on the Officer tab.')
      onAuth(r)}catch(x){setErr(x.message)}setBusy(false)}
  return <div style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:16}}><div className="card" style={{width:'100%',maxWidth:420}}>
    <h1 style={{display:'flex',gap:8,alignItems:'center',marginTop:0}}><ShieldCheck color="#0e9aa7"/>TrustGrid</h1>
    <div className="row">{[['applicant','Applicant'],['officer','Officer']].map(([k,l])=><button key={k} type="button" className={'btn'+(tab===k?' pri':'')} onClick={()=>{setTab(k);setMode('login');setErr('')}}>{l} login</button>)}</div>
    <form className="form" style={{gridTemplateColumns:'1fr'}} onSubmit={submit}>
      {reg&&<div><label htmlFor="n">Full name</label><input id="n" required value={f.name} onChange={set('name')} autoComplete="name"/></div>}
      <div><label htmlFor="e">Email</label><input id="e" type="email" required value={f.email} onChange={set('email')} autoComplete="username"/></div>
      <div><label htmlFor="p">Password</label><input id="p" type="password" required minLength={reg?8:1} value={f.password} onChange={set('password')} autoComplete={reg?'new-password':'current-password'}/></div>
      {err&&<div className="err" role="alert">{err}</div>}
      <div className="row"><button className="btn pri" disabled={busy}>{busy&&<Loader2 className="spin" size={16}/>}{reg?'Create account':'Sign in'}</button>
        {tab==='applicant'&&<button type="button" className="btn" onClick={()=>{setMode(reg?'login':'register');setErr('')}}>{reg?'I have an account':'Create account'}</button>}</div></form>
    <p style={{fontSize:13,color:'#64748b'}}>Officer accounts are created by an administrator and cannot be self-registered.</p>
    <button className="btn sm" onClick={()=>onAuth({token:'',user:{name:'Demo officer',role:'officer',offline:true}})}>Explore offline sample data</button>
  </div></div>
}

function Mine({list,open,go}){
  const label=a=>a.review==='Resolved'?'Review complete':a.review==='Action required'?'Action required':a.review==='In review'?'Under review':'Submitted'
  return <div className="card">{!list.length?<><p>You have not submitted an application on this device yet.</p><button className="btn pri" onClick={()=>go('new')}><FilePlus size={16}/>Submit application</button></>:
    <div className="scroll"><table><thead><tr><th>Application ID</th><th>Institution</th><th>Submitted</th><th>Status</th><th></th></tr></thead><tbody>
      {list.map(a=><tr key={a.id} onClick={()=>open(a.id,'status')}><td>{a.id}</td><td>{a.institution}</td><td>{a.submitted}</td><td><span className={'badge '+(a.review==='Action required'?'warn':a.review==='Resolved'?'ok':'mute')}>{label(a)}</span></td><td><button className="btn sm">View</button></td></tr>)}</tbody></table></div>}</div>
}

const fmtDate=d=>{try{return new Date(d).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})}catch{return d}}
const initials=n=>(n||'Officer').split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase()

function AssistantLogo({size=28}){
  return <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="agr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2457d6"/><stop offset="1" stopColor="#0e9aa7"/></linearGradient></defs>
    <rect width="32" height="32" rx="9" fill="url(#agr)"/><path d="M16 6l8 3v6c0 5-3.4 8.6-8 10.5C11.4 23.6 8 20 8 15V9l8-3z" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round"/>
    <path d="M16 11.5l1.1 2.9 2.9 1.1-2.9 1.1-1.1 2.9-1.1-2.9-2.9-1.1 2.9-1.1z" fill="#fff"/></svg>
}

function Assistant({a,reqs,focus,onClose,say}){
  const [plans,setPlans]=useState({}),[msgs,setMsgs]=useState([]),[text,setText]=useState(''),[busy,setBusy]=useState(false),end=useRef(null)
  useEffect(()=>{reqs.forEach(async r=>{try{const p=await call(`/applications/${a.id}/assistant/${r.doc}`);if(p)setPlans(x=>({...x,[r.doc]:p}))}catch(e){say(e.message)}})},[])
  useEffect(()=>{end.current&&end.current.scrollIntoView({block:'nearest'})},[msgs,busy])
  const ask=async q=>{q=(q||text).trim();if(!q||busy)return
    const history=msgs.map(m=>({role:m.me?'user':'model',text:m.t}));setMsgs(x=>[...x,{me:true,t:q}]);setText('');setBusy(true)
    try{const r=await send(`/applications/${a.id}/assistant/chat`,'POST',{message:q,history});setMsgs(x=>[...x,{t:r?r.reply:'I can\'t reach the server right now. Please try again in a moment.'}])}
    catch(e){setMsgs(x=>[...x,{t:e.message}])}setBusy(false)}
  const tips=['What exactly do I need to fix?','Where do I get a renewed certificate?','Can you fill in the form for me?']
  return <><div className="as-ov" onClick={onClose}/><aside className="as-drawer" role="dialog" aria-label="TrustGrid AI Assistant">
    <div className="as-head"><AssistantLogo size={38}/><div className="ar-grow"><b>TrustGrid Assistant</b><small>Explains what to fix and answers your questions</small></div><button className="icon" aria-label="Close assistant" onClick={onClose}><X/></button></div>
    <p className="as-note">I only advise. I never create, edit or improve documents, because your forms must be your own and certificates must come from the issuing authority. Only the officer decides on approval.</p>
    {reqs.map(r=>{const p=plans[r.doc];return <div key={r.id} className={'as-card'+(focus===r.doc?' focus':'')}>
      <b>{r.doc_title}</b><div className="as-quote">Officer: {r.message}</div>
      {!p?<p><Loader2 className="spin" size={14}/> Reading the note…</p>:<>
        <p>{p.summary}</p>
        {p.issues.map(i=><div className="as-issue" key={i.label}><b>{i.label}</b><span>{i.problem}</span><em>{i.how}</em></div>)}
        <ol>{p.steps.map(s=><li key={s}>{s}</li>)}</ol>
        {r.uploaded&&<span className="badge ok"><CheckCircle2 size={14}/>Updated file uploaded</span>}</>}</div>})}
    <div className="as-chat" aria-live="polite">
      {!msgs.length&&<div className="as-tips"><small>Ask me anything about this request:</small>{tips.map(t=><button key={t} className="chip" onClick={()=>ask(t)}>{t}</button>)}</div>}
      {msgs.map((m,i)=><div key={i} className={'as-msg'+(m.me?' me':'')}>{m.t}</div>)}
      {busy&&<div className="as-msg"><Loader2 className="spin" size={14}/> Thinking…</div>}<div ref={end}/></div>
    <form className="as-input" onSubmit={e=>{e.preventDefault();ask()}}><input aria-label="Ask the assistant" maxLength={1000} value={text} onChange={e=>setText(e.target.value)} placeholder="Type your question…"/>
      <button className="btn pri" disabled={busy||!text.trim()} aria-label="Send"><Send size={16}/></button></form>
  </aside></>
}

function ReqItem({r,a,busy,up,idx,onAssist}){
  const [over,setOver]=useState(false),Icon=(DOCS[r.doc]||[0,FileText])[1],done=!!r.uploaded,file=a.documents[r.doc]
  const pick=f=>{if(f)up(r.doc,f)}
  return <div className={'ar-item'+(done?' done':'')}>
    <div className="ar-item-head"><span className="ar-doc-ic"><Icon size={18}/></span>
      <div className="ar-grow"><div className="ar-doc-title">{r.doc_title}</div><div className="ar-doc-sub">Document {idx+1}</div></div>
      {!done&&<button className="btn sm" onClick={()=>onAssist(r.doc)}><AssistantLogo size={16}/>Ask the assistant</button>}{done?<span className="badge ok"><CheckCircle2 size={14}/>Updated</span>:<span className="badge warn"><Clock size={14}/>Waiting for upload</span>}</div>
    <div className="ar-msg"><div className="ar-av" aria-hidden="true">{initials(r.by)}</div>
      <div className="ar-bubble"><div className="ar-meta"><b>{r.by||'Reviewing officer'}</b>{r.created&&<span>{fmtDate(r.created)}</span>}</div>
        <div className="ar-label"><MessageSquare size={13}/>What needs fixing</div><p>{r.message}</p></div></div>
    {done?<div className="ar-file"><CheckCircle2 size={18} color="#16874a"/><div className="ar-grow"><b>{file?file.filename:'New file uploaded'}</b><small>Ready to resubmit</small></div>
        <label className="btn sm" style={{cursor:'pointer'}}>{busy===r.doc?<Loader2 className="spin" size={14}/>:<RefreshCw size={14}/>}Replace<input hidden type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>{pick(e.target.files[0]);e.target.value=''}}/></label></div>
      :<label className={'ar-drop'+(over?' over':'')} onDragOver={e=>{e.preventDefault();setOver(true)}} onDragLeave={()=>setOver(false)} onDrop={e=>{e.preventDefault();setOver(false);pick(e.dataTransfer.files[0])}}>
        <span className="ar-drop-ic">{busy===r.doc?<Loader2 className="spin" size={20}/>:<Upload size={20}/>}</span>
        <span><b>Upload corrected {(DOCS[r.doc]||[r.doc_title])[0]}</b><small>Drag and drop, or click to browse · PDF, JPG or PNG · up to 10 MB</small></span>
        <input hidden type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>{pick(e.target.files[0]);e.target.value=''}}/></label>}
  </div>
}

function ActionRequired({a,reqs,busy,up,resubmit,onAssist}){
  const n=reqs.length,d=reqs.filter(r=>r.uploaded).length,ready=n>0&&d===n
  return <div className="ar" role="alert">
    <div className="ar-head"><span className="ar-ic"><AlertTriangle size={22}/></span>
      <div className="ar-grow"><h3>Action required: update your documents</h3><p>The reviewing officer has asked for {n===1?'one document':n+' documents'} to be corrected. Read the note, upload the fixed file and resubmit.</p></div>
      <div className="ar-prog" aria-label={d+' of '+n+' documents updated'}><b>{d}/{n}</b><span>updated</span></div></div>
    <div className="ar-bar"><i style={{width:(n?d/n*100:0)+'%'}}/></div>
    <div className="ar-body">{reqs.map((r,i)=><ReqItem key={r.id} r={r} a={a} busy={busy} up={up} idx={i} onAssist={onAssist}/>)}</div>
    <div className="ar-foot"><button className="btn pri" disabled={busy==='resubmit'||!ready} onClick={resubmit}>{busy==='resubmit'?<Loader2 className="spin" size={16}/>:<Send size={16}/>}Resubmit for review</button>
      <span className="ar-hint">{ready?'All documents updated. You can resubmit now.':d?`${n-d} more document${n-d>1?'s':''} to upload before you can resubmit.`:'Upload the updated document(s) above to enable resubmit.'}</span></div>
  </div>
}

function Status({a,patch,say}){
  const steps=['Submitted','Under review','Review complete'],act=a.review==='Action required',i=a.review==='Resolved'?2:a.review==='In review'||act?1:0
  const reqs=(a.requests||[]).filter(r=>r.status==='open'),[busy,setBusy]=useState(''),[as_,setAs]=useState(null)
  const up=async(k,file)=>{if(!file)return
    if(!/\.(pdf|jpe?g|png)$/i.test(file.name)||file.size>10e6){say('Only PDF, JPG or PNG files up to 10 MB are accepted.');return}
    setBusy(k);try{const fd=new FormData();fd.append('file',file);const r=await call(`/applications/${a.id}/documents/${k}`,{method:'POST',body:fd});if(r){patch(a.id,()=>r);say('Document uploaded. Select Resubmit for review when done.')}}catch(e){say(e.message)}setBusy('')}
  const resubmit=async()=>{setBusy('resubmit');try{const r=await send(`/applications/${a.id}/resubmit`,'POST');if(r){patch(a.id,()=>r);say('Resubmitted. The officer has been notified.')}}catch(e){say(e.message)}setBusy('')}
  const uploaded=reqs.length&&reqs.every(r=>r.uploaded)
  return <>{act&&reqs.length>0&&<><button className="as-fab" onClick={()=>setAs('')} aria-label="Open TrustGrid AI Assistant"><AssistantLogo size={34}/><span>AI Assistant</span></button>{as_!==null&&<Assistant a={a} reqs={reqs} focus={as_} onClose={()=>setAs(null)} say={say}/>}</>}
    {act&&<ActionRequired a={a} reqs={reqs} busy={busy} up={up} resubmit={resubmit} onAssist={setAs}/>}
    {a.review==='Resolved'&&<div className="card" role="status" style={{borderLeft:'4px solid #16874a'}}><CheckCircle2 size={18} color="#16874a"/> The officer has completed the review of this application.</div>}
    <div className="card"><b>{a.id}</b> · {a.institution}
    <div className="steps" style={{marginTop:12}}>{steps.map((t,k)=><span key={t} className={k<=i?'on':''}>{t}</span>)}</div>
    <p>Submitted on {a.submitted}. {act?'Waiting for your updated documents.':'A review officer checks applications against configured rules.'} Findings are visible to the reviewing officer only.</p></div>
    <div className="card"><h3 style={{marginTop:0}}>Your documents</h3>{Object.entries(DOCS).map(([k,[t]])=><p key={k}>{a.documents[k]?<span className="badge ok"><CheckCircle2 size={14}/>{t}: {a.documents[k].filename}</span>:<span className="badge bad"><XCircle size={14}/>{t}: not uploaded</span>}</p>)}</div></>
}

export default function App(){
  const [auth,setAuth]=useState(()=>{try{const x=JSON.parse(store.get('tg_auth')||'null');if(x)TOKEN=x.token;return x}catch{return null}}),role=auth?auth.user.role:''
  const [apps,setApps]=useState([]),[live,setLive]=useState(false),[view,setView]=useState(role==='applicant'?'mine':'overview'),[sel,setSel]=useState(null),[toast,setToast]=useState(''),[conf,setConf]=useState(null),[nav,setNav]=useState(false),[note_,setNote_]=useState('')
  const say=m=>{setToast(m);setTimeout(()=>setToast(''),3500)}
  useEffect(()=>{if(!auth)return;if(auth.user.offline){setApps(demo.apps);return}call('/applications').then(d=>{if(d){note(d);setApps(d);setLive(true)}}).catch(e=>say(e.message))},[auth])
  const seen=useRef({})
  const note=d=>{d.forEach(x=>{const p=seen.current[x.id],n=(x.requests||[]).filter(r=>r.status==='open').length
    if(p){if(role==='applicant'){if(x.review==='Action required'&&n>p.n)say(`${x.id}: the officer asked you to update documents and resubmit`);else if(x.review==='Resolved'&&p.r!=='Resolved')say(`${x.id}: your application review is complete`)}
      else if(x.review==='Pending review'&&p.r==='Action required')say(`${x.id}: applicant resubmitted documents`)}
    seen.current[x.id]={r:x.review,n}})}
  useEffect(()=>{if(!auth||auth.user.offline)return;const t=setInterval(()=>{if(document.hidden)return;call('/applications').then(d=>{if(d){note(d);setApps(d)}}).catch(()=>{})},8000);return()=>clearInterval(t)},[auth,role])
  const onAuth=r=>{TOKEN=r.token;store.set('tg_auth',JSON.stringify(r));setApps([]);setLive(false);setAuth(r);setView(r.user.role==='applicant'?'mine':'overview');setSel(null)}
  const logout=()=>{TOKEN='';store.set('tg_auth','');setAuth(null);setApps([]);setLive(false)}
  const open=(id,v='detail')=>{setSel(id);setView(v);setNav(false)}
  const patch=(id,fn)=>setApps(l=>l.map(a=>a.id===id?fn(a):a))
  const go=k=>{setView(k);setNav(false)}
  const created=x=>setApps(l=>[...l,x])
  if(!auth)return <Login onAuth={onAuth}/>
  const a=apps.find(x=>x.id===sel),officer=role==='officer',menu=officer?OFFICER:APPLICANT
  const title=view==='detail'||view==='status'?'Application '+sel:view==='report'?'Report '+sel:(menu.find(n=>n[0]===view)||[0,''])[1]
  return <div className="shell">
    <aside className={'side'+(nav?' open':'')}><div className="logo"><ShieldCheck/>TrustGrid</div>
      {menu.map(([k,l,I])=><button key={k} className={view===k?'on':''} onClick={()=>go(k)}><I size={18}/>{l}</button>)}</aside>
    <main><header><button className="icon menu" title="Menu" aria-label="Menu" onClick={()=>setNav(!nav)}><Menu/></button>
      <div><small>TrustGrid / {title}</small><h1>{title}</h1></div><div className="grow"/>
      <span className="badge mute">{officer?'Officer view':'Applicant view'}</span>
      <button className="icon" title="Sign out" aria-label="Sign out" onClick={logout}><LogOut/></button>
      <button className="icon" title="Notifications" aria-label="Notifications" onClick={()=>say(officer?`${apps.filter(x=>x.review==='Pending review').length} application(s) awaiting review`:apps.filter(x=>x.review==='Action required').length?`${apps.filter(x=>x.review==='Action required').length} application(s) need your updated documents`:'No new notifications')}><Bell/>{!officer&&apps.some(x=>x.review==='Action required')&&<span style={{position:'absolute',top:2,right:2,width:9,height:9,borderRadius:'50%',background:'#dc2626'}}/>}</button>
      <div className="avatar" title={auth.user.name}>{(auth.user.name||'U').slice(0,2).toUpperCase()}</div></header>
      {!live&&<div className="banner">Offline demo: showing bundled sample data; actions apply locally only. Sign in to use the live backend.</div>}
      <section className="page">
        {officer&&<>
          {view==='overview'&&<Overview apps={apps} open={open} setView={go}/>}
          {view==='apps'&&<Table list={apps} onOpen={id=>open(id)} label="View"/>}
          {view==='reports'&&<Table list={apps.filter(x=>x.findings.length)} onOpen={id=>open(id,'report')} label="Report"/>}
          {view==='settings'&&<SettingsPage live={live}/>}
          {view==='detail'&&a&&<Detail a={a} live={live} patch={patch} say={say} ask={(msg,fn,input)=>{setNote_('');setConf({msg,fn,input})}} report={()=>setView('report')}/>}
          {view==='report'&&a&&<Report a={a} patch={patch} say={say} ask={(msg,fn)=>setConf({msg,fn})}/>}</>}
        {!officer&&<>
          {view==='mine'&&<Mine list={apps} open={open} go={go}/>}
          {view==='new'&&<NewApp live={live} say={say} open={id=>open(id,'status')} onCreated={created}/>}
          {view==='status'&&a&&<Status a={a} patch={patch} say={say}/>}</>}
      </section></main>
    {conf&&<div className="modal" role="dialog" aria-modal="true"><div><p>{conf.msg}</p>{conf.input&&<textarea aria-label="Message to applicant" rows="3" style={{width:'100%'}} placeholder="e.g. Registration number does not match the certificate" value={note_} onChange={e=>setNote_(e.target.value)}/>}<div className="row"><button className="btn" onClick={()=>setConf(null)}>Cancel</button><button className="btn pri" onClick={()=>{conf.fn(note_);setConf(null);setNote_('')}}>Confirm</button></div></div></div>}
    {toast&&<div className="toast" role="status">{toast}</div>}
  </div>
}
