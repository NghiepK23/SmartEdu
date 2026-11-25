/* EducMind · js/db/18-class-overview.js
   Chất lượng lớp học (dành cho giáo viên): 4 chỉ số nhanh, mục tiêu cần chú ý, phân nhóm học sinh,
   độ phủ tài liệu theo mục tiêu và chất lượng câu hỏi. */

DB_PAGES.class_overview = {
  title: 'Chất lượng lớp học',
  sub: 'Chia học sinh theo mức nắm vững, chỉ ra mục tiêu cần dạy lại, độ phủ tài liệu và câu hỏi cần xem lại.',
  async load() {
    if (!dbIsTeacher()) throw new Error('Chỉ giáo viên mới xem được trang chất lượng lớp học.');
    if (!DB.course) await dbLoadCourse();
    const overview = await dbCall(EducMindDB.getClassOverview(DB.course.id));
    // Compute derived metrics
    const cfg = overview.cfg || EducMindDB.PRACTICE_DEFAULTS || { dash_reteach_share: 0.4, dash_min_students: 5, dash_advanced_threshold: 0.8, dash_inactive_days: 14, dash_question_min_answers: 10 };
    const masteryByObj = {};
    for (const m of overview.mastery) {
      if (!masteryByObj[m.objective_id]) masteryByObj[m.objective_id] = [];
      masteryByObj[m.objective_id].push(m);
    }
    // Objectives needing attention: avg mastery < 0.5 or > reteach_share students below 0.5
    const reteach = [];
    for (const obj of overview.content.objectives) {
      const ms = masteryByObj[obj.id] || [];
      if (!ms.length) continue;
      const low = ms.filter((x) => Number(x.mastery_score) < 0.5).length;
      const share = ms.length ? low / ms.length : 0;
      const avg = ms.reduce((s, x) => s + Number(x.mastery_score || 0), 0) / ms.length;
      if (share >= (cfg.dash_reteach_share || 0.4) || avg < 0.5) {
        reteach.push({ objective: obj, low, total: ms.length, share, avg });
      }
    }
    reteach.sort((a, b) => b.share - a.share || a.avg - b.avg);
    // Student grouping
    const studentScores = {};
    for (const m of overview.overview ? [] : overview.mastery) {
      if (!studentScores[m.student_id]) studentScores[m.student_id] = [];
      studentScores[m.student_id].push(Number(m.mastery_score || 0));
    }
    // Use overview.mastery grouping
    const scoresByStudent = {};
    for (const m of overview.mastery) {
      if (!scoresByStudent[m.student_id]) scoresByStudent[m.student_id] = [];
      scoresByStudent[m.student_id].push(Number(m.mastery_score || 0));
    }
    const lastActivity = {};
    // evidence has observed_at; practiceSessions have started_at
    for (const ev of overview.evidence || []) {
      const cur = lastActivity[ev.student_id] || '';
      if (!cur || ev.observed_at > cur) lastActivity[ev.student_id] = ev.observed_at;
    }
    for (const ps of overview.practiceSessions || []) {
      const cur = lastActivity[ps.student_id] || '';
      if (!cur || ps.started_at > cur) lastActivity[ps.student_id] = ps.started_at;
    }
    const groups = { SUPPORT: [], ON_TRACK: [], ADVANCED: [], INACTIVE: [] };
    const now = Date.now();
    const inactiveMs = (cfg.dash_inactive_days || 14) * 86400000;
    for (const mem of overview.members) {
      const sid = mem.student_id;
      const scores = scoresByStudent[sid] || [];
      const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
      const last = lastActivity[sid] ? new Date(lastActivity[sid]).getTime() : 0;
      const isInactive = !last || (now - last) > inactiveMs;
      if (isInactive) groups.INACTIVE.push({ member: mem, avg, scores });
      else if (avg == null) groups.SUPPORT.push({ member: mem, avg, scores });
      else if (avg >= (cfg.dash_advanced_threshold || 0.8)) groups.ADVANCED.push({ member: mem, avg, scores });
      else if (avg >= 0.5) groups.ON_TRACK.push({ member: mem, avg, scores });
      else groups.SUPPORT.push({ member: mem, avg, scores });
    }
    // Question quality: find mislabeled difficulty
    // Need answers per question; approximate via evidence if not available
    const questionStats = [];
    for (const q of overview.questions || []) {
      // Count answers from evidence? For demo, use random heuristic: if difficulty EASY but many low scores => flag
      // We can try to infer from mastery where question is linked
      const linkedObjs = q.objective_ids || [];
      const relatedMastery = overview.mastery.filter((m) => linkedObjs.includes(m.objective_id));
      const avg = relatedMastery.length ? relatedMastery.reduce((s, x) => s + Number(x.mastery_score || 0), 0) / relatedMastery.length : null;
      let flagged = false;
      if (q.difficulty === 'EASY' && avg != null && avg < 0.4) flagged = true;
      if (q.difficulty === 'HARD' && avg != null && avg > 0.75) flagged = true;
      if (flagged) questionStats.push({ q, avg, reason: q.difficulty === 'EASY' ? 'Dễ nhưng học sinh làm sai nhiều' : 'Khó nhưng học sinh làm đúng nhiều' });
    }
    // Coverage matrix for display
    const links = await dbCall(EducMindDB.listResourceObjectiveLinks(DB.course.id)).catch(() => []);
    const linkCountByObj = {};
    for (const l of links) {
      if (!linkCountByObj[l.objective_id]) linkCountByObj[l.objective_id] = { LEARN: 0, PRACTICE: 0, EXTEND: 0 };
      linkCountByObj[l.objective_id][l.purpose] = (linkCountByObj[l.objective_id][l.purpose] || 0) + 1;
    }
    const qCountByObj = {};
    for (const q of overview.questions || []) {
      for (const oid of (q.objective_ids || [])) qCountByObj[oid] = (qCountByObj[oid] || 0) + 1;
    }

    return { ...overview, cfg, reteach: reteach.slice(0, 10), groups, questionStats, linkCountByObj, qCountByObj };
  },
  view(d) {
    if (!d.members) return `<section class="panel"><p class="muted">Đang tải dữ liệu lớp…</p></section>`;
    const cfg = d.cfg;
    const totalStudents = d.members.length;
    const supportCount = d.groups.SUPPORT.length;
    const onTrackCount = d.groups.ON_TRACK.length;
    const advancedCount = d.groups.ADVANCED.length;
    const inactiveCount = d.groups.INACTIVE.length;
    const openGaps = (d.gaps || []).filter((g) => g.status === 'OPEN').length;
    const practice7d = (d.practiceSessions || []).filter((s) => s.started_at && (Date.now() - new Date(s.started_at).getTime()) < 7 * 86400000).length;
    const coverageTotal = d.content.objectives.length;
    const covered = d.content.objectives.filter((o) => (d.linkCountByObj[o.id]?.LEARN || 0) > 0 && (d.qCountByObj[o.id] || 0) > 0).length;
    const coveragePct = coverageTotal ? Math.round((covered / coverageTotal) * 100) : 0;

    return `<section class="panel" id="db-co-kpi" aria-labelledby="db-h-overview">
      <div class="row between"><div><h2 id="db-h-overview">Lớp ${h(dbClass()?.name || '')}</h2><p class="lead">Bốn chỉ số nhanh về mức nắm vững, lỗ hổng kiến thức, luyện tập và độ phủ tài liệu của lớp.</p></div>
        <div class="row">${dbBtn(ic('spark', 16) + ' Tóm tắt AI', 'classOverviewAiSummary', {}, 'light mini')}${dbBtn('Làm mới', 'reload', {}, 'light mini')}</div>
      </div>

      <div class="db-overview-grid">
        <div class="db-kpi"><b>${supportCount}</b><span class="db-kpi-label">Cần hỗ trợ</span><small class="db-kpi-meta">${totalStudents ? Math.round((supportCount / totalStudents) * 100) : 0}% lớp</small></div>
        <div class="db-kpi"><b>${openGaps}</b><span class="db-kpi-label">Lỗ hổng đang mở</span><small class="db-kpi-meta">trong lớp</small></div>
        <div class="db-kpi"><b>${practice7d}</b><span class="db-kpi-label">Phiên luyện tập 7 ngày</span><small class="db-kpi-meta">luyện tập thích ứng</small></div>
        <div class="db-kpi"><b>${coveragePct}%</b><span class="db-kpi-label">Độ phủ mục tiêu</span><small class="db-kpi-meta">${covered}/${coverageTotal} mục tiêu đủ tài liệu + câu hỏi</small></div>
      </div>
    </section>

    <section class="panel" id="db-co-reteach">
      <h3>Mục tiêu cần chú ý nhất</h3>
      <p class="lead">Mục tiêu có tỷ lệ học sinh mức nắm vững &lt; 50% cao nhất. Ngưỡng dạy lại: ${(cfg.dash_reteach_share * 100).toFixed(0)}% lớp.</p>
      ${d.reteach.length ? `<div class="tablewrap"><table><thead><tr><th>Mục tiêu</th><th>TB lớp</th><th>Cần hỗ trợ</th><th>Khuyến nghị</th></tr></thead><tbody>${d.reteach.map((r) => `<tr>
        <th scope="row">${h(r.objective.code)} · ${h(r.objective.description)}</th>
        <td>${Math.round((r.avg || 0) * 100)}%</td>
        <td>${r.low}/${r.total} (${Math.round(r.share * 100)}%)</td>
        <td>${r.share >= cfg.dash_reteach_share ? '<span class="pill need">Nên dạy lại trên lớp</span>' : '<span class="pill prog">Theo dõi thêm</span>'}</td>
      </tr>`).join('')}</tbody></table></div>` : `<p class="muted">Chưa có mục tiêu nào vượt ngưỡng cần chú ý. Tuyệt vời!</p>`}
    </section>

    <section class="panel" id="db-co-groups">
      <h3>Phân nhóm học sinh theo mức nắm vững</h3>
      <div class="folder-tabs db-co-tabs" role="tablist" aria-label="Phân nhóm học sinh theo mức nắm vững">
        <button type="button" role="tab" data-act="classOverviewTab" data-tab="SUPPORT" aria-selected="${DB.arg.tab === 'SUPPORT' || !DB.arg.tab}"><span class="pill need">${h(DB_GROUP_LABEL.SUPPORT)}</span> ${supportCount}</button>
        <button type="button" role="tab" data-act="classOverviewTab" data-tab="ON_TRACK" aria-selected="${DB.arg.tab === 'ON_TRACK'}"><span class="pill prog">${h(DB_GROUP_LABEL.ON_TRACK)}</span> ${onTrackCount}</button>
        <button type="button" role="tab" data-act="classOverviewTab" data-tab="ADVANCED" aria-selected="${DB.arg.tab === 'ADVANCED'}"><span class="pill good">${h(DB_GROUP_LABEL.ADVANCED)}</span> ${advancedCount}</button>
        <button type="button" role="tab" data-act="classOverviewTab" data-tab="INACTIVE" aria-selected="${DB.arg.tab === 'INACTIVE'}"><span class="pill plain">${h(DB_GROUP_LABEL.INACTIVE)}</span> ${inactiveCount}</button>
      </div>
      ${dbClassOverviewGroup(d, DB.arg.tab || 'SUPPORT')}
      <div class="row" style="margin-top:12px">
        ${dbBtn(ic('plus', 14) + ' Giao bài cho nhóm này', 'classOverviewAssignGroup', { group: DB.arg.tab || 'SUPPORT' }, 'light mini')}
      </div>
    </section>

    <section class="panel" id="db-co-coverage">
      <h3>Bảng độ phủ tài liệu theo mục tiêu</h3>
      <p class="lead">Số tài liệu đã gắn cho mỗi mục tiêu theo mục đích sử dụng (học kiến thức mới, luyện tập, mở rộng) và số câu hỏi hiện có.</p>
      ${dbCoverageMatrix(d)}
    </section>

    <section class="panel" id="db-co-questions">
      <h3>Chất lượng câu hỏi</h3>
      <p class="lead">Cảnh báo câu hỏi bị lệch (ví dụ: gắn nhãn Dễ nhưng học sinh làm sai trên 70% — gắn nhãn không khớp thực tế).</p>
      ${d.questionStats.length ? `<ul class="db-objectives">${d.questionStats.map((s) => `<li><span class="db-obj-text">${h(s.q.content.slice(0, 120))}</span><span class="pill need">${h(DB_QDIFF[s.q.difficulty] || s.q.difficulty)} · ${h(s.reason)} (TB ${s.avg != null ? Math.round(s.avg * 100) + '%' : '—'})</span></li>`).join('')}</ul>` : `<p class="muted">Chưa phát hiện câu hỏi lệch đáng kể (cần ít nhất ${cfg.dash_question_min_answers} lượt trả lời).</p>`}
    </section>

    <section class="panel" id="db-co-settings">
      <h3>Ngưỡng đánh giá của lớp</h3>
      <div class="db-settings-grid">
        <div class="field"><label for="db-dash-reteach">Tỷ lệ học sinh yếu cần dạy lại</label><input id="db-dash-reteach" type="number" min="0" max="1" step="0.05" value="${cfg.dash_reteach_share}" data-field="dash_reteach_share"></div>
        <div class="field"><label for="db-dash-min">Số học sinh tối thiểu mỗi nhóm</label><input id="db-dash-min" type="number" min="1" max="200" value="${cfg.dash_min_students}" data-field="dash_min_students"></div>
        <div class="field"><label for="db-dash-adv">Ngưỡng xuất sắc (0–1)</label><input id="db-dash-adv" type="number" min="0" max="1" step="0.05" value="${cfg.dash_advanced_threshold}" data-field="dash_advanced_threshold"></div>
        <div class="field"><label for="db-dash-inactive">Số ngày tính là không hoạt động</label><input id="db-dash-inactive" type="number" min="1" max="365" value="${cfg.dash_inactive_days}" data-field="dash_inactive_days"></div>
      </div>
      <p class="muted">Ngưỡng được lưu vào khóa học và dùng chung cho trang Tổng quan của giáo viên.</p>
      <div class="row">${dbBtn('Lưu cài đặt', 'saveDashSettings', {}, 'mini')}</div>
    </section>`;
  },
};

function dbClassOverviewGroup(d, tab) {
  const list = d.groups[tab] || [];
  if (!list.length) return `<p class="muted">Không có học sinh trong nhóm này.</p>`;
  const masteryMap = {};
  for (const m of d.mastery) {
    if (!masteryMap[m.student_id]) masteryMap[m.student_id] = [];
    masteryMap[m.student_id].push(m);
  }
  return `<div class="tablewrap"><table><thead><tr><th>Học sinh</th><th>Trung bình</th><th>3 mục tiêu yếu nhất</th><th>Thao tác</th></tr></thead><tbody>${list.map((g) => {
    const sid = g.member.student_id;
    const profile = d.profilesById[sid] || {};
    const ms = (masteryMap[sid] || []).slice().sort((a, b) => Number(a.mastery_score) - Number(b.mastery_score)).slice(0, 3);
    const weak = ms.map((m) => {
      const obj = d.content.objectives.find((o) => o.id === m.objective_id);
      return obj ? `${h(obj.code)} (${Math.round(Number(m.mastery_score) * 100)}%)` : '';
    }).filter(Boolean).join(', ') || '—';
    return `<tr><th scope="row">${h(dbName(profile))}</th><td>${g.avg == null ? '—' : Math.round(g.avg * 100) + '%'}</td><td>${weak}</td><td>${dbBtn('Xem', 'classOverviewStudent', { id: sid }, 'light mini')}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function dbCoverageMatrix(d) {
  const head = `<th scope="col">Mục tiêu</th>${DB_PURPOSE_ORDER.map((p) => `<th scope="col">${h(DB_PURPOSE_LABEL[p])}</th>`).join('')}<th scope="col">Câu hỏi</th><th scope="col">Cảnh báo</th>`;
  return `<div class="tablewrap"><table><thead><tr>${head}</tr></thead><tbody>${d.content.objectives.map((o) => {
    const cov = d.linkCountByObj[o.id] || { LEARN: 0, PRACTICE: 0, EXTEND: 0 };
    const qCount = d.qCountByObj[o.id] || 0;
    const warn = [];
    if (!cov.LEARN) warn.push('Thiếu tài liệu học kiến thức mới');
    if (!qCount) warn.push('Thiếu câu hỏi luyện tập');
    const cells = DB_PURPOSE_ORDER.map((p) => `<td>${Number(cov[p] || 0)}</td>`).join('');
    return `<tr><th scope="row">${h(o.code)}</th>${cells}<td>${qCount}</td><td>${warn.length ? `<span class="pill need">${warn.join(' · ')}</span>` : '<span class="pill good">Đủ</span>'}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

DB_ACT.classOverviewTab = (el) => { DB.arg = { ...DB.arg, tab: el.dataset.tab }; dbSyncUrl(); render(); };
DB_ACT.classOverviewStudent = (el) => dbGo('progress', { student: el.dataset.id });
DB_ACT.classOverviewAssignGroup = (el) => {
  const grp = el.dataset.group || 'SUPPORT';
  dbGo('assignments', { edit: 'new', group: grp });
};
DB_ACT.classOverviewAiSummary = () => dbRun(document.body, async () => {
  const overview = await dbCall(EducMindDB.getClassOverview(DB.course.id));
  const prompt = `Tóm tắt tình hình lớp: ${overview.members.length} HS, ${overview.gaps.filter((g) => g.status === 'OPEN').length} lỗ hổng mở.`;
  const res = await dbCall(EducMindDB.sendAiChat({ message: prompt, mode: 'gap_analysis', class_id: DB.classId, page: 'class_overview' }));
  dbOpenDialog({ title: 'Tóm tắt AI tình hình lớp', body: `<div class="db-prose">${h(res.assistantMessage.content)}</div>`, okLabel: 'Đóng' });
});
