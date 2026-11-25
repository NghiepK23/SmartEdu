/* EducMind · js/18-student-dashboard.js
   Thành phần biểu đồ dùng chung cho trang Tổng quan của học sinh. */
function studentMasteryDonut(counts,total){
  if(!total)return `<div class='sd-chart-empty'><span>${ic('target',20)}</span><b>Chưa có mục tiêu học tập</b><small>Kết quả sẽ xuất hiện khi lớp công bố mục tiêu.</small></div>`;
  const parts=[['good','Đã vững',counts.good,'var(--good-bar)'],['progress','Đang tiến bộ',counts.progress,'var(--prog-bar)'],['need','Cần củng cố',counts.need,'var(--need-bar)'],['unknown','Chưa có dữ liệu',counts.unknown,'var(--track)']];
  let at=0;
  const stops=parts.map(([, ,count,color])=>{const start=at/total*360;at+=count;return `${color} ${start}deg ${at/total*360}deg`}).join(',');
  const known=counts.good+counts.progress+counts.need;
  const label=parts.map(([,name,count])=>`${name}: ${count}`).join(', ');
  return `<div class='sd-mastery-summary'>
    <div class='sd-mastery-donut' style='background:conic-gradient(${stops})' role='img' aria-label='Phân bố ${total} mục tiêu học tập: ${esc(label)}'><div><b>${known}/${total}</b><small>có kết quả</small></div></div>
    <div class='sd-mastery-legend'>${parts.map(([tone,name,count])=>`<div><i class='is-${tone}'></i><span>${name}</span><b>${count}</b><small>${Math.round(count/total*100)}%</small></div>`).join('')}</div>
  </div>`;
}
function studentLearningChart(data,label,emptyMessage){
  const points=data.map((point)=>({label:point.label,value:Number.isFinite(point.value)?Math.max(0,Math.min(100,point.value)):null}));
  if(!points.some((point)=>point.value!=null))return `<div class='sd-chart-empty'><span>${ic('trend',20)}</span><b>${esc(emptyMessage)}</b><small>Điểm sẽ xuất hiện sau khi có kết quả được ghi nhận.</small></div>`;
  const left=42,right=660,top=18,bottom=178,height=bottom-top;
  const x=(index)=>left+index*(right-left)/Math.max(1,points.length-1),y=(value)=>bottom-value*height/100;
  const observed=points.map((point,index)=>point.value==null?null:{x:x(index),y:y(point.value),...point}).filter(Boolean);
  const path=observed.map((point,index)=>{const px=point.x.toFixed(1),py=point.y.toFixed(1);if(!index)return `M${px} ${py}`;const prev=observed[index-1],mid=((prev.x+point.x)/2).toFixed(1);return `C${mid} ${prev.y.toFixed(1)} ${mid} ${py} ${px} ${py}`}).join(' ');
  const areas=observed.length>1?`<path class='sd-chart-area' d='${path} L${observed[observed.length-1].x} ${bottom} L${observed[0].x} ${bottom} Z'/>`:'';
  const lines=observed.length>1?`<path class='sd-chart-line' d='${path}'/>`:'';
  const markers=observed.map((point)=>`<circle class='sd-chart-point' cx='${point.x}' cy='${point.y}' r='4'><title>${esc(label)} · ${esc(point.label)}: ${Math.round(point.value)}%</title></circle>`).join('');
  const grid=[0,25,50,75,100].map((value)=>{const yy=y(value);return `<line class='sd-chart-grid-line' x1='${left}' y1='${yy}' x2='${right}' y2='${yy}'/><text class='sd-chart-axis-label' x='${left-9}' y='${yy+4}' text-anchor='end'>${value}</text>`}).join('');
  const dayLabels=points.map((point,index)=>`<text class='sd-chart-axis-label' x='${x(index)}' y='207' text-anchor='middle'>${esc(point.label)}</text>`).join('');
  const summary=points.map((point)=>`${point.label} ${point.value==null?'chưa có điểm':Math.round(point.value)+'%'}`).join('; ');
  return `<svg class='sd-learning-chart' viewBox='0 0 680 220' role='img' aria-label='${esc(`${label} trong 7 ngày qua: ${summary}`)}'>
    <defs><linearGradient id='sd-learning-area' x1='0' x2='0' y1='0' y2='1'><stop offset='0' stop-color='#1f6f6b' stop-opacity='.30'/><stop offset='1' stop-color='#1f6f6b' stop-opacity='0'/></linearGradient></defs>
    ${grid}${areas}${lines}${markers}${dayLabels}
  </svg>`;
}
