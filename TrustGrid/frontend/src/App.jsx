import {useState,useEffect,useRef} from 'react'
import {LayoutDashboard,FolderOpen,FilePlus,FileText,ClipboardCheck,Settings as Cog,ShieldCheck,Bell,CheckCircle2,AlertTriangle,XCircle,Eye,Upload,Trash2,Printer,Play,Loader2,Menu,LogOut,Building2,Flame,ScrollText} from 'lucide-react'
import demo from './demo.json'

const API=(import.meta.env.VITE_API_URL||'')+'/api' // empty in local dev (Vite proxy), full Render URL in production
const ST={Passed:[CheckCircle2,'ok'],Warning:[AlertTriangle,'warn'],Failed:[XCircle,'bad'],'Needs Review':[Eye,'rev']}
const DOCS={application:['Institution Application Form',FileText,'Application with institution details'],registration:['Registration Certificate',ScrollText,'Institution registration proof'],building:['Building Completion Certificate',Building2,'Occupancy / completion certificate'],fire:['Fire Safety Certificate',Flame,'Current fire safety clearance']}
const NAV=[['overview','Overview',LayoutDashboard],['apps','Applications',FolderOpen],['new','New Application',FilePlus],['reports','Verification Reports',FileText],['queue','Review Queue',ClipboardCheck],['settings','Settings',Cog]]
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
        <div className="evid">Evidence: {f.evidence}</div>
        <div className="row" style={{margin:'8px 0 0'}}>{DOCS[f.doc]&&<button className="btn sm" onClick={()=>setD(f.doc)}><Eye size={14}/>View source</button>}
          {['Failed','Warning','Needs Review'].includes(f.status)&&f.resolution==='open'&&<><button className="btn sm" onClick={()=>act(f,'resolved')}>Resolve</button><button className="btn sm" onClick={()=>act(f,'dismissed')}>Dismiss false positive</button></>}</div></div>)}</div>)}
    </div></div></>
}

function Report({a}){
  const n=s=>a.findings.filter(f=>f.status===s).length
  return <div className="card"><div className="row noprint"><button className="btn pri" onClick={()=>window.print()}><Printer size={16}/>Print / save as PDF</button></div>
    <h2>TrustGrid Verification Report</h2>
    <p><b>Application:</b> {a.id}<br/><b>Institution:</b> {a.institution}<br/><b>Verification date:</b> 2026-10-22 (reference date)<br/><b>Documents processed:</b> {Object.keys(a.documents).length} of 4<br/>
    <b>Checks:</b> {a.findings.length} total · {n('Passed')} passed · {n('Warning')} warnings · {n('Failed')} failed · {n('Needs Review')} need review<br/><b>Review status:</b> {a.review}</p>
    {a.findings.map(f=><div key={f.id} className={'finding '+ST[f.status][1]}><Badge s={f.status}/> <b>{f.title}</b> ({f.resolution}) <p>{f.detail}</p><div className="evid">Evidence: {f.evidence}</div></div>)}
    <p><b>Reviewer notes:</b> {a.notes||'None'}</p>
    <p className="disc">{DISC} Issuer verification and digital-signature verification are not implemented.</p></div>
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

function Status({a,patch,say}){
  const steps=['Submitted','Under review','Review complete'],act=a.review==='Action required',i=a.review==='Resolved'?2:a.review==='In review'||act?1:0
  const reqs=(a.requests||[]).filter(r=>r.status==='open'),[busy,setBusy]=useState('')
  const up=async(k,file)=>{if(!file)return
    if(!/\.(pdf|jpe?g|png)$/i.test(file.name)||file.size>10e6){say('Only PDF, JPG or PNG files up to 10 MB are accepted.');return}
    setBusy(k);try{const fd=new FormData();fd.append('file',file);const r=await call(`/applications/${a.id}/documents/${k}`,{method:'POST',body:fd});if(r){patch(a.id,()=>r);say('Document uploaded. Select Resubmit for review when done.')}}catch(e){say(e.message)}setBusy('')}
  const resubmit=async()=>{setBusy('resubmit');try{const r=await send(`/applications/${a.id}/resubmit`,'POST');if(r){patch(a.id,()=>r);say('Resubmitted. The officer has been notified.')}}catch(e){say(e.message)}setBusy('')}
  const uploaded=reqs.length&&reqs.every(r=>r.uploaded)
  return <>{act&&<div className="card" role="alert" style={{borderLeft:'4px solid #d97706'}}><h3 style={{marginTop:0}}><AlertTriangle size={18} color="#d97706"/> Action required: update your documents</h3>
      <p>The reviewing officer asked you to update the following and resubmit.</p>
      {reqs.map(r=><div key={r.id} style={{margin:'8px 0'}}><b>{r.doc_title}</b>{r.uploaded&&<span className="badge ok" style={{marginLeft:8}}><CheckCircle2 size={14}/>New file uploaded</span>}<br/>{r.message}
        {r.doc&&DOCS[r.doc]&&<div style={{marginTop:6}}><label className="btn sm" style={{cursor:'pointer'}}>{busy===r.doc?<Loader2 className="spin" size={14}/>:<Upload size={14}/>}Upload updated {DOCS[r.doc][0]}<input hidden type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e=>{up(r.doc,e.target.files[0]);e.target.value=''}}/></label></div>}</div>)}
      <button className="btn pri" disabled={busy==='resubmit'||!uploaded} onClick={resubmit}>{busy==='resubmit'&&<Loader2 className="spin" size={16}/>}Resubmit for review</button>
      {!uploaded&&<p style={{fontSize:13,color:'#64748b'}}>Upload the updated document(s) above to enable resubmit.</p>}</div>}
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
          {view==='queue'&&<Table list={apps} onOpen={id=>open(id)} label="Review"/>}
          {view==='settings'&&<SettingsPage live={live}/>}
          {view==='detail'&&a&&<Detail a={a} live={live} patch={patch} say={say} ask={(msg,fn,input)=>{setNote_('');setConf({msg,fn,input})}} report={()=>setView('report')}/>}
          {view==='report'&&a&&<Report a={a}/>}</>}
        {!officer&&<>
          {view==='mine'&&<Mine list={apps} open={open} go={go}/>}
          {view==='new'&&<NewApp live={live} say={say} open={id=>open(id,'status')} onCreated={created}/>}
          {view==='status'&&a&&<Status a={a} patch={patch} say={say}/>}</>}
      </section></main>
    {conf&&<div className="modal" role="dialog" aria-modal="true"><div><p>{conf.msg}</p>{conf.input&&<textarea aria-label="Message to applicant" rows="3" style={{width:'100%'}} placeholder="e.g. Registration number does not match the certificate" value={note_} onChange={e=>setNote_(e.target.value)}/>}<div className="row"><button className="btn" onClick={()=>setConf(null)}>Cancel</button><button className="btn pri" onClick={()=>{conf.fn(note_);setConf(null);setNote_('')}}>Confirm</button></div></div></div>}
    {toast&&<div className="toast" role="status">{toast}</div>}
  </div>
}
