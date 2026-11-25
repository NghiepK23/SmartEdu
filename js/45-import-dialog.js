/* EducMind · js/45-import-dialog.js
   Chuẩn hóa chuỗi tiếng Việt (nz) và tạo tệp mẫu Excel, CSV, Word cho nhập câu hỏi. */
const IMPFMT={
  questions:{title:'Nhập câu hỏi từ tệp',file:'Mau_cau_hoi.xlsx',sheet:'Câu hỏi',w:[6,24,48,20,18,18,18,18,24,34,14,14,12,40],
    head:['STT','Bài học','Câu hỏi','Dạng câu hỏi','Đáp án A','Đáp án B','Đáp án C','Đáp án D','Đáp án đúng','Cặp ghép (mỗi dòng: trái => phải)','Mục tiêu','Độ khó','Mức Bloom','Giải thích đáp án'],
    rows:[
      ['1','','Địa chỉ IPv4 gồm bao nhiêu bit?','Một lựa chọn','8','16','32','64','C','','','Dễ','Nhớ','IPv4 có địa chỉ dài 32 bit.'],
      ['2','','Những thiết bị nào là thiết bị mạng?','Nhiều lựa chọn','Router','Switch','Bàn phím','Chuột','A, B','','','Trung bình','Hiểu','Router kết nối các mạng; switch kết nối thiết bị trong cùng mạng.'],
      ['3','','Thủ đô của Việt Nam là _____.','Điền khuyết','','','','','Hà Nội','','','Dễ','Nhớ',''],
      ['4','','Ghép mỗi thuật ngữ với mô tả phù hợp.','Ghép đôi','','','','','','Router => Kết nối các mạng\nSwitch => Kết nối thiết bị trong cùng mạng','','Trung bình','Hiểu',''],
    ],
    note:'Dạng câu hỏi có thể để trống cho câu trắc nghiệm cũ hoặc chọn Một lựa chọn, Nhiều lựa chọn, Điền khuyết, Ghép đôi, Đúng / Sai, Trả lời ngắn, Tự luận. Điền khuyết: đánh dấu từng ô bằng ít nhất ba dấu gạch dưới (___); nhập đáp án theo đúng thứ tự, mỗi ô ngăn cách bằng |. Ghép đôi: mỗi dòng trong cột Cặp ghép có dạng “Mục bên trái => Mục bên phải”; cần ít nhất hai dòng. Trắc nghiệm: điền đáp án A–D và ghi chữ cái đúng ở Đáp án đúng. Cột Bài học (không bắt buộc) ghi đúng tên bài học; nhiều bài cách nhau bằng |. Cột Mục tiêu (mã cách nhau dấu phẩy), Độ khó, Mức Bloom và Giải thích đáp án là tùy chọn. Dòng lỗi được bỏ qua, các dòng còn lại vẫn nhập.'},
  students:{title:'Nhập danh sách học sinh từ tệp',file:'Mau_danh_sach_hoc_sinh.xlsx',sheet:'Học sinh',w:[6,28,34,26],
    head:['Họ tên','Email','Mật khẩu mặc định'],rows:[['Nguyễn Văn An','an.nv@school.edu.vn',''],['Trần Thị Bình','binh.tt@school.edu.vn','HocSinh@2026']]}
};
const nz=t=>String(t==null?'':t).toLowerCase().replace(/đ/g,'d').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
async function impTemplate(kind){
  const S=IMPFMT[kind]||IMPFMT.questions;
  if(typeof DBTF==='undefined'){impTemplateCsv(S);return}
  DBTF.exportExcel(S.file,[{name:S.sheet,headers:S.head,rows:S.rows,widths:S.w}],{title:S.title});
  toast('Đã tải tệp mẫu Excel: '+S.file);
}
async function impTemplateWord(kind){
  const S=IMPFMT[kind]||IMPFMT.questions,name=S.file.replace(/\.xlsx$/,'.docx');
  if(typeof DBTF==='undefined'){toast('Không thể tạo mẫu Word trong phiên này.');return}
  DBTF.exportWord(name,S.title,[{table:{headers:S.head,rows:S.rows,widths:S.w},note:S.note||'',landscape:true}],{footnote:''});
  toast('Đã tải tệp mẫu Word: '+name);
}
/* Mẫu dạng CSV dùng khi chưa nạp bộ xuất OOXML */
function impTemplateCsv(S){
  const q=v=>{const s=String(v==null?'':v);return /[",;\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
  const csv='\ufeff'+[S.head].concat(S.rows).map(r=>r.map(q).join(',')).join('\r\n');
  const name=S.file.replace(/\.xlsx$/,'.csv'),blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  try{
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),1500);toast('Đã tải tệp mẫu: '+name+' (Excel mở được, có thể lưu lại thành .xlsx).');
  }catch(e){toast('Không lưu được tệp mẫu ở chế độ xem này.')}
}
