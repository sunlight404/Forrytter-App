import React, { useId } from 'react';
export default function Dropdown({label,value,onChange,options,placeholder='Velg navn',disabled=false}) {
  const id=useId();
  return <div style={{marginBottom:14}}><label htmlFor={id} style={{display:'block',fontFamily:'system-ui',fontSize:12,color:'#6b746a',marginBottom:6}}>{label}</label><select id={id} value={options.some(o=>o.value===value)?value:''} disabled={disabled} onChange={e=>onChange(e.target.value||null)} style={{boxSizing:'border-box',width:'100%',padding:12,border:'1px solid #d8d4ca',borderRadius:10,background:'#fff',color:'#283126',fontSize:16,minHeight:46}}><option value="">{placeholder}</option>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></div>;
}
