/* EducMind · js/67-teacher-dashboard.js
   Tiện ích lời chào theo khung giờ cho màn hình Tổng quan giáo viên. */
function dashboardGreeting(date=new Date()){
  const hour=date.getHours();
  return hour<12?'Chào buổi sáng':hour<18?'Chào buổi chiều':'Chào buổi tối';
}
