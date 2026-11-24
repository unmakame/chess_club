import React,{useEffect,useRef,useState} from "react";

export default function SectionNav({items, active}) {
  const [preview,setPreview]=useState(null);
  const timer=useRef(null);
  function close() {
    clearTimeout(timer.current);
    setPreview(null);
  }
  function show(url) {
    clearTimeout(timer.current);
    if (window.self !== window.top || !matchMedia("(hover:hover)").matches) return;
    timer.current=setTimeout(()=>setPreview(url),180);
  }
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  return <nav aria-label="Основное меню" onPointerLeave={close} onBlur={event=>{
    if(!event.currentTarget.contains(event.relatedTarget)) close();
  }} onKeyDown={event=>{if(event.key==="Escape") close();}}>
    {items.map(([url,title])=><span className="nav-item" key={url}
      onPointerEnter={event=>{if(event.pointerType==="mouse") show(url);}}>
      <a href={url} onFocus={()=>show(url)} aria-current={active===url?"page":undefined} className={active===url?"current":""}>{title}</a>
      {preview===url && <a className="nav-preview" href={url} tabIndex={-1} aria-label={"Открыть раздел «"+title+"»"}>
        <span className="preview-window" inert={true} aria-hidden="true"><iframe tabIndex={-1} title={title} src={url}/></span>
      </a>}
    </span>)}
  </nav>;
}
