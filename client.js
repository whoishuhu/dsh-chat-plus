window.__ModuleLoader__.load({
  id: 'dsh-chat-plus',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const ReactDOM = require('react-dom')
    const NS = 'chatplus'
    const CSS = `
      .chatplus-actions{height:calc(28px + var(--dsh-content-font-delta,0px));display:flex;align-items:center;gap:8px}
      .chatplus-user-row{width:100%;display:flex;flex-direction:column;align-items:flex-end;gap:6px}
      .chatplus-user-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;align-self:flex-end;max-width:100%}
      .chatplus-user-row [data-chatplus-content]{align-self:flex-end;max-width:100%}
      .chatplus-action-controls{display:inline-flex;align-items:center;gap:5px;padding-right:8px;border-right:1px solid var(--dsw-alias-border-l1)}
      .chatplus-version-meta{display:inline-flex;align-items:center;gap:4px;padding-left:2px}
      .chatplus-meta-model{font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
      .chatplus-btn{width:calc(28px + var(--dsh-content-font-delta,0px));height:calc(28px + var(--dsh-content-font-delta,0px));border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-tertiary);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:6px}
      .chatplus-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
      .chatplus-btn:disabled{opacity:.45;cursor:default}
      .chatplus-btn svg{width:15px;height:15px}
      .chatplus-switch{display:inline-flex;align-items:center;gap:2px;color:var(--dsw-alias-label-tertiary);font-size:12px}
      .chatplus-switch button{border:0;background:transparent;color:inherit;cursor:pointer;padding:3px 5px;border-radius:var(--dsw-radius-sm,6px)}
      .chatplus-switch button:hover{background:var(--dsw-alias-interactive-bg-hover)}
      .chatplus-badge{font-size:12px;color:var(--dsw-alias-label-tertiary);padding:0 4px;white-space:nowrap}
      .chatplus-modal-root{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center}
      .chatplus-mask{position:absolute;inset:0;background:rgba(0,0,0,.42)}
      .chatplus-dialog{position:relative;z-index:1;width:min(520px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg,12px);box-shadow:0 16px 48px rgba(0,0,0,.32);padding:20px}
      .chatplus-dialog h2{font-size:17px;line-height:24px;margin:0 28px 8px 0}
      .chatplus-dialog p{font-size:14px;line-height:21px;color:var(--dsw-alias-label-secondary);margin:0 0 16px}
      .chatplus-dialog textarea{width:100%;min-height:120px;box-sizing:border-box;resize:vertical;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;padding:10px}
      .chatplus-dialog-close{position:absolute;right:12px;top:12px}
      .chatplus-dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}
      .chatplus-dialog-actions button,.chatplus-bin-row button{border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-primary);padding:7px 12px;cursor:pointer}
      .chatplus-dialog-actions .primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:#fff}
      .chatplus-dialog-actions .danger,.chatplus-danger{color:var(--dsw-alias-state-error-primary)}
      .chatplus-bin{width:min(620px,calc(100vw - 32px))}
      .chatplus-bin-toolbar{display:flex;justify-content:flex-end;gap:8px;margin-bottom:12px}
      .chatplus-bin-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--dsw-alias-border-l1)}
      .chatplus-bin-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .chatplus-bin-meta{font-size:12px;color:var(--dsw-alias-label-tertiary)}
      .chatplus-dock{display:flex;align-items:center;gap:10px;padding:6px 10px;color:var(--dsw-alias-label-secondary);font-size:13px}
      .chatplus-dock button{border:0;background:transparent;color:inherit;cursor:pointer}
      .chatplus-select{accent-color:var(--dsw-alias-brand-primary);margin-right:5px}
      .chatplus-editbox{display:flex;flex-direction:column;gap:8px;align-items:stretch;min-width:min(480px,70vw)}
      .chatplus-attach{font-size:12px;color:var(--dsw-alias-label-secondary);display:flex;gap:7px;align-items:center}
    `
    const svg = (kind) => {
      const paths = {
        copy: h(React.Fragment,null,h('rect',{x:8,y:7,width:11,height:13,rx:2,fill:'none',stroke:'currentColor',strokeWidth:1.7}),h('path',{d:'M5 16V5a1 1 0 0 1 1-1h10',fill:'none',stroke:'currentColor',strokeWidth:1.7,strokeLinecap:'round'})),
        refresh: h('path',{d:'M19 8a7 7 0 1 0 1 6',fill:'none',stroke:'currentColor',strokeWidth:1.8,strokeLinecap:'round'}),
        trash: h('path',{d:'M5 7h14M9 7V5h6v2m-8 0 1 12h8l1-12M10 10v6m4-6v6',fill:'none',stroke:'var(--dsw-alias-state-error-primary)',strokeWidth:1.6,strokeLinecap:'round'}),
        edit: h('path',{d:'m5 17-.8 3 3-.8L18 8.4 15.6 6 5 17Zm9.5-9.5 2.4 2.4',fill:'none',stroke:'currentColor',strokeWidth:1.6,strokeLinecap:'round',strokeLinejoin:'round'}),
        back: h('path',{d:'M9 7 4 12l5 5M5 12h9a5 5 0 0 1 5 5',fill:'none',stroke:'var(--dsw-alias-label-secondary)',strokeWidth:1.7,strokeLinecap:'round',strokeLinejoin:'round'}),
        left: h('path',{d:'m14 6-6 6 6 6',fill:'none',stroke:'currentColor',strokeWidth:2,strokeLinecap:'round',strokeLinejoin:'round'}),
        right: h('path',{d:'m10 6 6 6-6 6',fill:'none',stroke:'currentColor',strokeWidth:2,strokeLinecap:'round',strokeLinejoin:'round'}),
        close: h('path',{d:'m6 6 12 12M18 6 6 18',fill:'none',stroke:'currentColor',strokeWidth:1.8,strokeLinecap:'round'}),
        archive: h('path',{d:'M4 7h16v13H4zM3 4h18v3H3zM9 11h6',fill:'none',stroke:'currentColor',strokeWidth:1.5,strokeLinecap:'round',strokeLinejoin:'round'})
      }
      return h('svg',{viewBox:'0 0 24 24','aria-hidden':'true'},paths[kind] || paths.copy)
    }
    let runtimeCtx
    const nowClock = (time) => { if (!time) return ''; const d=new Date(time); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}` }
    const api = async (body) => { const r=await fetch('/api/chatplus.op',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}); const d=await r.json(); if(!r.ok||!d.ok) throw new Error(d.message||'操作失败'); return d.value }
    async function restoreDraft({text,attachments}, inputActions, sessionId, ctx) {
      inputActions?.setDraft?.(text || '')
      if (!inputActions?.addAttachments || !attachments?.length) return
      const scoped=ctx?.sessions?.scope?.(sessionId)
      const conversation=scoped?.get?.('conversation')
      if(!conversation?.createDrafts) return
      const files=[]
      for (const ref of attachments) {
        const value=await api({op:'attachment',type:ref.type,attachment:ref.attachment})
        const bytes=Uint8Array.from(atob(value.data),c=>c.charCodeAt(0))
        files.push(new File([bytes],value.name||'attachment',{type:value.mediaType||'application/octet-stream'}))
      }
      const drafts=conversation.createDrafts(sessionId,files,true)
      inputActions.addAttachments(drafts.map(d=>d.id))
    }
    const contentParts = (content) => { const text=[], attachments=[], rest=[]; for(const b of content||[]){ if(b?.type==='text') text.push(b.text||''); else if((b?.type==='image'||b?.type==='file')&&b.attachment) attachments.push(b); else rest.push(b) } return {text:text.join(''),attachments,rest} }
    const turnOf = node => { const l=node?.location; return l&&(l.kind==='turn'||l.kind==='step') ? l.turn.turn : null }
    const useToast = () => { const [toast,setToast]=React.useState(null); const show=React.useCallback((text)=>{setToast(text);setTimeout(()=>setToast(null),4500)},[]); return {toast,show} }
    function Button({kind,label,onClick,disabled,danger}) { return h('button',{type:'button',className:'chatplus-btn'+(danger?' chatplus-danger':''),title:label,'aria-label':label,onClick,disabled},svg(kind)) }
    function Modal({title,description,onClose,children,footer}) { React.useEffect(()=>{const f=e=>{if(e.key==='Escape')onClose()};document.addEventListener('keydown',f);return()=>document.removeEventListener('keydown',f)},[onClose]); return ReactDOM.createPortal(h('div',{className:'chatplus-modal-root',role:'presentation'},h('div',{className:'chatplus-mask',onClick:onClose}),h('div',{className:'chatplus-dialog',role:'dialog','aria-modal':'true','aria-label':title},h('button',{className:'chatplus-btn chatplus-dialog-close',onClick:onClose,'aria-label':'Close'},svg('close')),h('h2',null,title),description&&h('p',null,description),children,footer&&h('div',{className:'chatplus-dialog-actions'},footer))),document.body) }
    const stores = new Map()
    const editStores = new Map()
    const editFor = sessionId => { let s=editStores.get(sessionId); if(!s){let value=null;const ls=new Set();s={getSnapshot:()=>value,subscribe:f=>{ls.add(f);return()=>ls.delete(f)},set:v=>{value=v;ls.forEach(f=>f())}};editStores.set(sessionId,s)} return s }
    const storeFor = sessionId => { let s=stores.get(sessionId); if(!s){let value=null;const ls=new Set();s={getSnapshot:()=>value,subscribe:f=>{ls.add(f);return()=>ls.delete(f)},set:v=>{value=v;ls.forEach(f=>f())}};stores.set(sessionId,s)} return s }
    const selectStores = new Map()
    const selectFor = sessionId => { let s=selectStores.get(sessionId); if(!s){let value={active:false,items:[]};const ls=new Set();s={getSnapshot:()=>value,subscribe:f=>{ls.add(f);return()=>ls.delete(f)},set:v=>{value=v;ls.forEach(f=>f())},toggle:item=>{const key=`${item.scope}:${item.turn}`;const items=value.items.some(x=>`${x.scope}:${x.turn}`===key)?value.items.filter(x=>`${x.scope}:${x.turn}`!==key):[...value.items,item];s.set({...value,items})},clear:()=>s.set({active:false,items:[]}),activate:()=>s.set({...value,active:true})};selectStores.set(sessionId,s)} return s }
    function Confirm({request,onClose,onConfirm}) { if(!request)return null; return h(Modal,{title:request.title,description:request.description,onClose},h('div',{className:'chatplus-dialog-actions'},h('button',{onClick:onClose},request.error?'关闭':'取消'),!request.error&&h('button',{className:request.warning?'primary':'primary danger',onClick:request.onConfirm||onConfirm},request.confirm||'确认')))}
    function HiddenRows({sessionId,useProjection}) { const value=useProjection('chatPlus'); React.useEffect(()=>{const hidden=value?.hidden||{};let css=''; for(const [turn,scope] of Object.entries(hidden)){const root=`[data-conversation-session="${sessionId}"]`; const sel=`${root} [data-chat-turn="${turn}"]`; css+=scope==='reply'?`${sel}:not([data-chat-flow-kind="user"]):not([data-chat-flow-kind="steering"]){display:none!important;}`:`${sel}{display:none!important;}`; css+=`${root} button[aria-label*="Jump to turn ${turn}"],${root} button[aria-label*="跳转到第 ${turn} 轮"],${root} button[aria-label*="ターン ${turn}"],${root} button[aria-label*="turno ${turn}"],${root} button[aria-label*="tour ${turn}"],${root} button[aria-label*="Runde ${turn}"],${root} button[aria-label*="ходу ${turn}"],${root} button[aria-label*="turno ${turn}"]{display:none!important;}`} const el=document.createElement('style');el.dataset.chatplusStyle=sessionId;el.textContent=css;document.head.appendChild(el);return()=>el.remove()},[sessionId,value]); return null }
    function VersionActions({messageId,sessionId,useChat,useProjection,t}) { const value=useProjection('chatPlus'); const turn=useChat(s=>{for(const x of s.timeline?.turns?.values?.()||[]){const d=x.data?.get?.('turn-tail');if(d?.closing?.finalNode?.messageId===messageId)return x.turn??x.end?.turn} return null}); const group=value?.groups?.find(g=>g.turns.includes(turn)); const meta=value?.meta?.[String(turn)]; const active=group&&group.active===turn; const last=value?.last===turn; const [confirm,setConfirm]=React.useState(null); const [busy,setBusy]=React.useState(false); const run=async(body)=>{setBusy(true);try{await api(body)}catch(e){setConfirm({title:'操作失败',description:e.message,confirm:'关闭',error:true})}finally{setBusy(false)}}; React.useEffect(()=>{if(!active||!last||!group||group.turns.length<2)return;const f=e=>{if(['INPUT','TEXTAREA'].includes(e.target.tagName)||e.target.isContentEditable)return;const i=group.turns.indexOf(turn);if(e.key==='ArrowLeft'&&i>0)run({op:'switch',sessionId,group:group.id,to:group.turns[i-1]});if(e.key==='ArrowRight'&&i<group.turns.length-1)run({op:'switch',sessionId,group:group.id,to:group.turns[i+1]})};document.addEventListener('keydown',f);return()=>document.removeEventListener('keydown',f)},[active,last,group,turn,sessionId]); const selection=React.useSyncExternalStore(selectFor(sessionId).subscribe,selectFor(sessionId).getSnapshot); if(!turn||value?.running)return null; const idx=group?group.turns.indexOf(turn):-1; return h(React.Fragment,null,h('div',{className:'chatplus-actions'},h('input',{type:'checkbox',className:'chatplus-select',title:'选择此回复',checked:selection.items.some(x=>x.turn===turn&&x.scope==='reply'),onChange:()=>selectFor(sessionId).toggle({turn,scope:'reply'})}),group&&active&&last&&h('span',{className:'chatplus-switch'},h('button',{onClick:()=>idx>0&&run({op:'switch',sessionId,group:group.id,to:group.turns[idx-1]}),disabled:busy||idx<=0},svg('left')),`${idx+1}/${group.turns.length}`,h('button',{onClick:()=>idx<group.turns.length-1&&run({op:'switch',sessionId,group:group.id,to:group.turns[idx+1]}),disabled:busy||idx>=group.turns.length-1},svg('right'))),h('span',{className:'chatplus-version-meta'},h('span',{className:'chatplus-meta-model'},meta?.model||'')),h('span',{className:'chatplus-action-controls'},h('button',{className:'chatplus-btn',title:'重新生成',onClick:()=>{const execute=()=>run({op:'regen',sessionId,turn});if(meta?.tools)setConfirm({title:'工具可能再次执行',description:'此回复调用过工具，重新生成可能再次执行工具；之前的文件改动和外部副作用不会自动撤销。',confirm:'继续重新生成',warning:true,onConfirm:()=>{setConfirm(null);execute()}});else execute()},disabled:busy||!last},svg('refresh')),h('button',{className:'chatplus-btn chatplus-danger',title:'删除回复',onClick:()=>setConfirm({title:'删除回复',description:'将删除这条回复、思考和工具调用，问题保留。',confirm:'删除'}),disabled:busy},svg('trash')))),confirm&&h(Confirm,{request:confirm,onClose:()=>setConfirm(null),onConfirm:()=>{setConfirm(null);run({op:'delete',sessionId,items:[{turn,scope:'reply'}]})}})) }
    function UserNode({node,renderFactorySlot,loadImage,sessionId,t,useProjection,inputActions}) { const data=node.data; const turn=turnOf(node); const value=useProjection('chatPlus'); const selection=React.useSyncExternalStore(selectFor(sessionId).subscribe,selectFor(sessionId).getSnapshot); const [confirm,setConfirm]=React.useState(null); const [edit,setEdit]=React.useState(false); const [text,setText]=React.useState(contentParts(data.content).text); const [busy,setBusy]=React.useState(false); const parts=contentParts(data.content); const ask=async(body)=>{setBusy(true);try{return await api(body)}catch(e){setConfirm({title:'操作失败',description:e.message,confirm:'关闭'});return null}finally{setBusy(false)}}; const startEdit=async()=>{editFor(sessionId).set({turn,text:parts.text,attachments:parts.attachments.map(b=>({type:b.type,attachment:b.attachment}))});await restoreDraft({text:parts.text,attachments:parts.attachments.map(b=>({type:b.type,attachment:b.attachment}))},inputActions,sessionId,runtimeCtx).catch(e=>setConfirm({title:'编辑失败',description:e.message,confirm:'关闭',error:true}));}; const actions=h('div',{className:'chatplus-user-actions'},turn&&h('input',{type:'checkbox',className:'chatplus-select',title:'选择整轮',checked:selection.items.some(x=>x.turn===turn&&x.scope==='turn'),onChange:()=>selectFor(sessionId).toggle({turn,scope:'turn'})}),h('span',{className:'chatplus-action-controls'},h(Button,{kind:'copy',label:'复制',onClick:()=>navigator.clipboard?.writeText(parts.text)}),turn&&h(Button,{kind:'edit',label:'编辑问题',disabled:busy,onClick:startEdit}),turn&&h(Button,{kind:'back',label:'回退',disabled:busy,onClick:()=>setConfirm({title:'回退会话',description:'会话会回退到当前节点，后续轮次全部删除，是否继续？',confirm:'继续回退'})}),turn&&h(Button,{kind:'trash',label:'删除问题和回复',danger:true,disabled:busy,onClick:()=>setConfirm({title:'删除整轮',description:'将删除这个问题及其全部回复版本、思考和工具调用。',confirm:'删除'})}))); const prepared={text:parts.text,attachments:parts.attachments.map(b=>b.type==='image'?{type:'image',image:{attachment:b.attachment}}:{type:'file',file:b.attachment}),extraBlocks:parts.rest}; return h(React.Fragment,null,h('div',{className:'chatplus-user-row'},h('div',{'data-chatplus-content':true},renderFactorySlot('conversation.chat.user.content',{content:prepared,loadImage,interactive:true})),actions),confirm&&h(Confirm,{request:confirm,onClose:()=>setConfirm(null),onConfirm:async()=>{const op=confirm.title==='回退会话'?'rollback':'delete';setConfirm(null);const result=await ask(op==='rollback'?{op,sessionId,turn}:{op,sessionId,items:[{turn,scope:'turn'}]});if(op==='rollback'&&result)restoreDraft(result,inputActions,sessionId,runtimeCtx).catch(e=>setConfirm({title:'附件恢复失败',description:e.message,confirm:'关闭'}))}})) }
    function SessionDeleteOverlay({useDeleteRequest}) {
      const request = useDeleteRequest()
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState(null)
      const [running, setRunning] = React.useState(null)
      React.useEffect(() => { let live = true; if (request) api({op:'activity',sessionId:request.sessionId}).then(x=>{if(live)setRunning(x.running)}).catch(e=>{if(live)setError(e.message)}); return()=>{live=false} }, [request?.sessionId])
      if (!request) return null
      const close = () => { if (!busy) storeFor('session-delete').set(null) }
      const confirm = async (stop) => {
        setBusy(true); setError(null)
        try { await api({op:'trash', sessionId:request.sessionId, title:request.displayTitle, stop}); storeFor('session-delete').set(null) }
        catch (e) { if(e.message.includes('still running')){setRunning(true);setError('此会话或子代理仍在运行。选择“停止并删除”以停止，或取消。')} else setError(e.message) }
        finally { setBusy(false) }
      }
      return h(Modal, {title:'删除会话', description: error || (running===null?'正在检查会话状态…':running?`“${request.displayTitle || request.sessionId}”仍在运行。选择停止并删除，或取消。`:`将“${request.displayTitle || request.sessionId}”移入回收站。`), onClose:close,
        footer:h(React.Fragment,null,h('button',{onClick:close,disabled:busy},'取消'),h('button',{className:'primary danger',onClick:()=>confirm(running===true),disabled:busy||running===null},busy?'处理中…':running?'停止并删除':'移入回收站'))})
    }
    function SelectionDock({sessionId,inputActions,useInput}) { const draft=useInput(s=>s.draft?.text ?? ''); const sel=React.useSyncExternalStore(selectFor(sessionId).subscribe,selectFor(sessionId).getSnapshot); const edit=React.useSyncExternalStore(editFor(sessionId).subscribe,editFor(sessionId).getSnapshot); if(!sel.active&&sel.items.length===0&&!edit)return null; const s=selectFor(sessionId); const finish=async()=>{const text=draft||'';if(!text.trim()||!edit)return;const keep=edit.attachments||[];await api({op:'edit',sessionId,turn:edit.turn,text,keep});editFor(sessionId).set(null)}; return h('div',{className:'chatplus-dock'},edit&&h(React.Fragment,null,h('span',null,`正在编辑第 ${edit.turn} 轮`),h('button',{className:'primary',onClick:finish},'提交编辑'),h('button',{onClick:()=>{editFor(sessionId).set(null);inputActions?.setDraft?.('')}},'取消编辑')),!edit&&h(React.Fragment,null,h('button',{onClick:()=>s.activate()},'多选'),h('span',null,`已选择 ${sel.items.length} 条`),h('button',{className:'chatplus-danger',disabled:sel.items.length===0,onClick:()=>{if(window.confirm('删除选中的消息？'))api({op:'delete',sessionId,items:sel.items}).then(()=>s.clear())}},'批量删除'),h('button',{onClick:()=>s.clear()},'取消'))) }
    function Footer({wide}) {
      const [open, setOpen] = React.useState(false)
      const [items, setItems] = React.useState([])
      const reload = React.useCallback(() => api({op:'list'}).then(x => setItems(x.items || [])).catch(() => {}), [])
      React.useEffect(() => { if (open) reload() }, [open, reload])
      const rows = items.length ? items.map(item => h('div', {className:'chatplus-bin-row', key:item.id},
        h('div', {className:'chatplus-bin-title'}, item.title || item.id),
        h('span', {className:'chatplus-bin-meta'}, new Date(item.trashedAt).toLocaleString()),
        h('button', {onClick:() => api({op:'restore',sessionId:item.id}).then(reload)}, '还原'),
        h('button', {className:'chatplus-danger', onClick:() => { if(window.confirm('永久删除此会话？')) api({op:'purge',sessionId:item.id}).then(reload) }}, '永久删除')
      )) : h('p', null, '回收站为空')
      return h(React.Fragment, null,
        h('button', {type:'button', className:'chatplus-dock', title:'回收站', 'aria-label':'回收站', onClick:() => setOpen(true)}, svg('archive'), wide && h('span', null, '回收站')),
        open && h(Modal, {title:'回收站', onClose:() => setOpen(false), children:h('div', {className:'chatplus-bin'},
          h('div', {className:'chatplus-bin-toolbar'}, h('button', {className:'chatplus-danger', onClick:() => { if(window.confirm('永久删除回收站中的全部会话？')) api({op:'empty'}).then(reload) }}, '清空回收站')),
          rows
        )})
      )
    }
    function apply(ctx) { runtimeCtx=ctx; ctx.effect(()=>{const style=document.createElement('style');style.textContent=CSS;document.head.appendChild(style);return()=>style.remove()},'chatplus styles'); ctx.slots.inject('shell.overlay',()=>ctx.slots.register({name:'shell.overlay',id:'chatplus-delete-session',locale:NS,inject:()=>({hooks:{deleteRequest:storeFor('session-delete')}})},({useDeleteRequest})=>h(SessionDeleteOverlay,{useDeleteRequest}))); ctx.effect(()=>ctx.locale.register(NS,{zh:{close:'关闭'},en:{close:'Close'},ja:{close:'閉じる'},es:{close:'Cerrar'},fr:{close:'Fermer'},de:{close:'Schließen'},ru:{close:'Закрыть'},pt:{close:'Fechar'}}),'chatplus locale'); ctx.slots.inject('conversation.chat.node',()=>ctx.slots.register({name:'conversation.chat.node',key:'user',priority:-100,locale:NS},UserNode)); ctx.slots.inject('conversation.chat.node',()=>ctx.slots.register({name:'conversation.chat.node',key:'steering',priority:-100,locale:NS},UserNode)); ctx.slots.inject('conversation.chat.assistant-actions',()=>ctx.slots.register({name:'conversation.chat.assistant-actions',id:'chatplus-actions',order:20,locale:NS},VersionActions)); ctx.slots.inject('conversation.composer.dock',()=>ctx.slots.register({name:'conversation.composer.dock',id:'chatplus-hidden',order:99,locale:NS},({sessionId,useProjection,useInput,inputActions})=>h(React.Fragment,null,h(HiddenRows,{sessionId,useProjection}),h(SelectionDock,{sessionId,inputActions,useInput})))); ctx.slots.inject('sidebar.footer.action',()=>ctx.slots.register({name:'sidebar.footer.action',id:'chatplus-recycle',order:90,locale:NS},Footer)); const menus=ctx.get('contextMenus'); if(menus) ctx.effect(()=>menus.register({id:'session.chatplus-delete',target:'session',order:700,observe:()=>[ctx.locale],resolve:target=>[{id:'delete',label:'删除会话',icon:{key:'chatplus.trash'},danger:true,afterContent:true,run:()=>{storeFor('session-delete').set(target);}}]}),'chatplus session menu'); ctx.slots.inject('contextMenu.icon',()=>ctx.slots.register({name:'contextMenu.icon',key:'chatplus.trash'},()=>svg('trash'))); }
    return { inject:['slots','locale'], apply }
  }
})
