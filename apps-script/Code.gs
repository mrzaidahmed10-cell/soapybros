/**
 * Soapy Bros - complete backend + sheet formatting
 * ------------------------------------------------
 * Paste this whole file into Extensions > Apps Script of the NEW Google Sheet
 * (replace everything that is there), then follow the steps in SETUP below.
 *
 * What it does
 *  1. Formats two tabs: "Bookings" (every field the booking form collects, plus
 *     the street address) and "Expenses" (you fill it in by hand).
 *  2. Receives booking requests from the website, adds a row, and puts a
 *     2-hour event on the "Soapy Bros" Google Calendar.
 *  3. Feeds the site: busy times for the date picker, open/closed switch,
 *     banner message, visitor analytics, and the dev-portal booking list/delete.
 *
 * SETUP
 *  1. Run setupSoapyBrosSheet() once (Run button) and approve the permissions.
 *  2. Project Settings (gear) > Time zone > (GMT-06:00) America/Chicago.
 *  3. Deploy > New deployment > type "Web app"
 *       Execute as: Me      Who has access: Anyone
 *     Copy the Web app URL that ends in /exec and send it to the web team.
 *  4. Any time you edit this code later: Deploy > Manage deployments > pencil >
 *     Version: New version > Deploy. The URL stays the same.
 */

// ---------- settings you may change ----------
var SB_CALENDAR_NAME = 'Soapy Bros';   // falls back to your default calendar if not found
var SB_DEV_TOKEN     = '!soapybros';   // must match the dev portal password
var SB_SLOT_HOURS    = 2;
var SB_SCREEN_PX     = 1400;           // total column width, tuned to fill a laptop screen
var SB_BUFFER_ROWS   = 500;            // empty formatted rows kept below the data
var SB_BUSY_DAYS     = 90;             // how far ahead the date picker looks

var SB_NAVY   = '#0b1f3a';
var SB_NAVY2  = '#16335c';
var SB_ACCENT = '#2f6fed';
var SB_BAND   = '#f2f6fc';
var SB_LINE   = '#d5deec';
var SB_FIRST  = 6;                     // first data row on both tabs

var BOOK_COLS = [
  // [header, weight, alignment]
  ['Submitted', 112, 'left'],
  ['Status',     92, 'center'],
  ['Customer',  125, 'left'],
  ['Phone',     105, 'left'],
  ['Email',     175, 'left'],
  ['Date',      120, 'left'],
  ['Time',      135, 'left'],
  ['Vehicle',    80, 'left'],
  ['Service',   120, 'left'],
  ['Add-ons',   150, 'left'],
  ['Quote',      72, 'right'],
  ['Address',   160, 'left'],
  ['City',       95, 'left'],
  ['Zip',        55, 'center'],
  ['Notes',     150, 'left']
];
var INC_COLS = [
  ['Date',            110, 'left'],
  ['Customer',        150, 'left'],
  ['Service',         160, 'left'],
  ['Vehicle',          90, 'left'],
  ['Paid to',         120, 'left'],
  ['Amount',          100, 'right'],
  ['Payment method',  130, 'left'],
  ['Notes',           220, 'left']
];
var EXP_COLS = [
  ['Date',           100, 'left'],
  ['Category',       140, 'left'],
  ['Paid to',        150, 'left'],
  ['Description',    230, 'left'],
  ['Payment method', 125, 'left'],
  ['Amount',          95, 'right'],
  ['Notes',          170, 'left'],
  ['',                18, 'left'],      // spacer
  ['Category',       140, 'left'],      // summary block
  ['Total',           90, 'right'],
  ['% of total',      75, 'center']
];
var STATUSES = ['New', 'Confirmed', 'Completed', 'Cancelled'];
var CATEGORIES = ['Soap & chemicals', 'Towels & supplies', 'Equipment', 'Fuel', 'Vehicle upkeep',
                  'Insurance', 'Marketing', 'Website & software', 'Fees & taxes', 'Payroll', 'Other'];
var METHODS = ['Cash', 'Card', 'Venmo', 'Zelle', 'Cash App', 'Check', 'Other'];

// =====================================================================
//  SHEET SETUP  (safe to run again; it never deletes your rows)
// =====================================================================

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Soapy Bros')
    .addItem('Re-apply formatting', 'setupSoapyBrosSheet')
    .addItem('Grant calendar access', 'authorizeSoapyBros')
    .addItem('Sync income from completed bookings', 'syncIncome_')
    .addToUi();
}

// Run this once to grant Calendar access (the permission popup appears when you run it).
function authorizeSoapyBros() {
  var cal = calendar_();
  var n = cal.getEvents(new Date(), new Date(Date.now() + 7 * 86400000)).length;
  SpreadsheetApp.getActiveSpreadsheet().getName();
  Logger.log('Calendar "' + cal.getName() + '" is reachable. Events in the next 7 days: ' + n);
}

function setupSoapyBrosSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone('America/Chicago');
  var bookings = ss.getSheetByName('Bookings');
  if (!bookings) {
    var first = ss.getSheets()[0];
    if (first && first.getLastRow() === 0 && !ss.getSheetByName('Expenses')) {
      bookings = first.setName('Bookings');
    } else {
      bookings = ss.insertSheet('Bookings', 0);
    }
  }
  var income = ss.getSheetByName('Income') || ss.insertSheet('Income');
  var expenses = ss.getSheetByName('Expenses') || ss.insertSheet('Expenses');
  formatBookings_(bookings);
  formatIncome_(income);
  formatExpenses_(expenses);
  syncIncome_();
  ss.setActiveSheet(bookings);
  SpreadsheetApp.flush();
}

function prepareGrid_(sh, ncols) {
  var maxC = sh.getMaxColumns();
  if (maxC < ncols) sh.insertColumnsAfter(maxC, ncols - maxC);
  maxC = sh.getMaxColumns();
  if (maxC > ncols) sh.deleteColumns(ncols + 1, maxC - ncols);
  var used = Math.max(sh.getLastRow(), SB_FIRST - 1);
  var wantRows = Math.max(used + SB_BUFFER_ROWS, SB_FIRST + SB_BUFFER_ROWS);
  var maxR = sh.getMaxRows();
  if (maxR < wantRows) sh.insertRowsAfter(maxR, wantRows - maxR);
  maxR = sh.getMaxRows();
  if (maxR > wantRows) sh.deleteRows(wantRows + 1, maxR - wantRows);
  sh.getBandings().forEach(function (b) { b.remove(); });
  sh.setConditionalFormatRules([]);
  sh.getRange(1, 1, 5, ncols).breakApart();
  sh.setHiddenGridlines(true);
  var all = sh.getRange(1, 1, sh.getMaxRows(), ncols);
  all.setFontFamily('Inter').setFontSize(10).setVerticalAlignment('middle').setFontColor('#1b2a41');
}

function applyWidths_(sh, cols) {
  var total = 0; cols.forEach(function (c) { total += c[1]; });
  var scale = SB_SCREEN_PX / total;
  cols.forEach(function (c, i) { sh.setColumnWidth(i + 1, Math.round(c[1] * scale)); });
}

function titleBlock_(sh, ncols, title, subtitle) {
  var t = sh.getRange(1, 1, 1, ncols).merge();
  t.setValue(title).setBackground(SB_NAVY).setFontColor('#ffffff').setFontSize(22).setFontWeight('bold')
    .setHorizontalAlignment('left').setVerticalAlignment('middle');
  t.setBorder(null, null, null, null, null, null);
  sh.getRange(1, 1).setHorizontalAlignment('left');
  var s = sh.getRange(2, 1, 1, ncols).merge();
  s.setValue(subtitle).setBackground(SB_NAVY).setFontColor('#9fb6dc').setFontSize(10)
    .setHorizontalAlignment('left').setVerticalAlignment('top');
  sh.setRowHeight(1, 48); sh.setRowHeight(2, 26);
  // left padding via indent effect: use an accent strip under the title
  sh.getRange(2, 1, 1, ncols).setBorder(null, null, true, null, null, null, SB_ACCENT, SpreadsheetApp.BorderStyle.SOLID_THICK);
}

function kpi_(sh, row, c1, c2, formula, color) {
  var r = sh.getRange(row, c1, 1, c2 - c1 + 1).merge();
  r.setFormula(formula).setBackground(color || '#e8effb').setFontColor(SB_NAVY).setFontWeight('bold')
    .setFontSize(11).setHorizontalAlignment('center').setVerticalAlignment('middle')
    .setBorder(true, true, true, true, null, null, '#ffffff', SpreadsheetApp.BorderStyle.SOLID_THICK);
}

function headerRow_(sh, cols) {
  var h = sh.getRange(5, 1, 1, cols.length);
  h.setValues([cols.map(function (c) { return c[0]; })])
    .setBackground(SB_NAVY2).setFontColor('#ffffff').setFontWeight('bold').setFontSize(10)
    .setHorizontalAlignment('center').setVerticalAlignment('middle')
    .setBorder(null, null, true, null, null, null, SB_ACCENT, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sh.setRowHeight(5, 34);
}

function alignBody_(sh, cols, lastRow) {
  var n = lastRow - SB_FIRST + 1;
  cols.forEach(function (c, i) {
    if (!c[0] && i > 0) return;
    sh.getRange(SB_FIRST, i + 1, n, 1).setHorizontalAlignment(c[2]);
  });
  sh.setRowHeightsForced ? sh.setRowHeightsForced(SB_FIRST, n, 26) : sh.setRowHeights(SB_FIRST, n, 26);
}

function formatBookings_(sh) {
  var N = BOOK_COLS.length;
  prepareGrid_(sh, N);
  var last = sh.getMaxRows();
  titleBlock_(sh, N, 'SOAPY BROS  |  Booking Requests',
    'Mobile car detailing  -  Iowa City, Coralville, North Liberty  -  new requests from the website land here automatically');
  sh.setRowHeight(3, 40); sh.setRowHeight(4, 8);
  var rng = '$B$' + SB_FIRST + ':$B';
  var qr  = '$K$' + SB_FIRST + ':$K';
  kpi_(sh, 3, 1, 3,  '="New requests:  "&COUNTIF(' + rng + ',"New")', '#fff4d6');
  kpi_(sh, 3, 4, 6,  '="Confirmed:  "&COUNTIF(' + rng + ',"Confirmed")', '#dbe8ff');
  kpi_(sh, 3, 7, 9,  '="Completed:  "&COUNTIF(' + rng + ',"Completed")', '#d9f2e3');
  kpi_(sh, 3, 10, 12, '="Quote value, completed:  "&TEXT(SUMIFS(' + qr + ',' + rng + ',"Completed"),"$#,##0")', '#d9f2e3');
  kpi_(sh, 3, 13, 15, '="Upcoming quote value:  "&TEXT(SUMIFS(' + qr + ',' + rng + ',"New")+SUMIFS(' + qr + ',' + rng + ',"Confirmed"),"$#,##0")', '#e8effb');
  sh.getRange(4, 1, 1, N).setBackground('#ffffff');
  headerRow_(sh, BOOK_COLS);

  var body = sh.getRange(SB_FIRST, 1, last - SB_FIRST + 1, N);
  body.setBorder(null, null, null, null, null, true, SB_LINE, SpreadsheetApp.BorderStyle.SOLID);
  alignBody_(sh, BOOK_COLS, last);
  var n = last - SB_FIRST + 1;
  sh.getRange(SB_FIRST, 1, n, 1).setNumberFormat('mmm d, h:mm am/pm');
  sh.getRange(SB_FIRST, 6, n, 1).setNumberFormat('ddd, mmm d, yyyy');
  sh.getRange(SB_FIRST, 11, n, 1).setNumberFormat('$#,##0.00');
  sh.getRange(SB_FIRST, 14, n, 1).setNumberFormat('@');
  sh.getRange(SB_FIRST, 4, n, 1).setNumberFormat('@');
  sh.getRange(SB_FIRST, 15, n, 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  sh.getRange(SB_FIRST, 5, n, 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  sh.getRange(SB_FIRST, 12, n, 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);

  // status dropdown + colours
  var st = sh.getRange(SB_FIRST, 2, n, 1);
  st.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).setAllowInvalid(false).build());
  st.setFontWeight('bold');
  var rules = [
    statusRule_(st, 'New', '#fff0c2', '#8a5a00'),
    statusRule_(st, 'Confirmed', '#d6e6ff', '#0b3d91'),
    statusRule_(st, 'Completed', '#d2f0de', '#14663a'),
    statusRule_(st, 'Cancelled', '#e9e9ee', '#6b6f7b')
  ];
  // grey-out cancelled rows
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$B' + SB_FIRST + '="Cancelled"')
    .setFontColor('#9aa1b0').setRanges([sh.getRange(SB_FIRST, 1, n, N)]).build());
  sh.setConditionalFormatRules(rules);

  var band = sh.getRange(SB_FIRST, 1, n, N).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);
  band.setFirstRowColor('#ffffff').setSecondRowColor(SB_BAND);

  applyWidths_(sh, BOOK_COLS);
  sh.setFrozenRows(5);
  sh.setFrozenColumns(0);   // merged title spans every column, so columns cannot be frozen
  if (sh.getFilter()) sh.getFilter().remove();
  sh.getRange(5, 1, last - 4, N).createFilter();
  sh.setTabColor(SB_ACCENT);
}

function statusRule_(range, text, bg, fg) {
  return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(text)
    .setBackground(bg).setFontColor(fg).setRanges([range]).build();
}

function formatExpenses_(sh) {
  var N = EXP_COLS.length;
  prepareGrid_(sh, N);
  var last = sh.getMaxRows();
  var n = last - SB_FIRST + 1;
  titleBlock_(sh, N, 'SOAPY BROS  |  Expenses',
    'Type each expense on the next empty row. Totals and the category breakdown update on their own.');
  sh.setRowHeight(3, 40); sh.setRowHeight(4, 40);
  var amt = '$F$' + SB_FIRST + ':$F';
  var dt  = '$A$' + SB_FIRST + ':$A';
  kpi_(sh, 3, 1, 2, '="Total spent:  "&TEXT(SUM(' + amt + '),"$#,##0.00")', '#fde4e4');
  kpi_(sh, 3, 3, 4, '="This month:  "&TEXT(SUMIFS(' + amt + ',' + dt + ',">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1)),"$#,##0.00")', '#fff4d6');
  kpi_(sh, 3, 5, 7, '="Last 30 days:  "&TEXT(SUMIFS(' + amt + ',' + dt + ',">="&(TODAY()-30)),"$#,##0.00")', '#e8effb');
  kpi_(sh, 3, 9, 11, '="Entries:  "&COUNT(' + amt + ')', '#e8effb');
  var rev = 'SUM(Income!$F$' + SB_FIRST + ':$F)';
  kpi_(sh, 4, 1, 2, '="Income (Income tab):  "&TEXT(' + rev + ',"$#,##0.00")', '#d9f2e3');
  kpi_(sh, 4, 3, 4, '="Estimated profit:  "&TEXT(' + rev + '-SUM(' + amt + '),"$#,##0.00")', '#d9f2e3');
  kpi_(sh, 4, 5, 7, '="Income is added automatically when a booking is marked Completed. See the Income tab."', '#f4f6fa');
  sh.getRange(4, 5).setFontWeight('normal').setFontSize(9).setFontColor('#55627a').setWrap(true);
  kpi_(sh, 4, 9, 11, '="Top category:  "&IFERROR(INDEX($I$' + SB_FIRST + ':$I$' + (SB_FIRST + CATEGORIES.length - 1) + ',MATCH(MAX($J$' + SB_FIRST + ':$J$' + (SB_FIRST + CATEGORIES.length - 1) + '),$J$' + SB_FIRST + ':$J$' + (SB_FIRST + CATEGORIES.length - 1) + ',0)),"-")', '#e8effb');
  headerRow_(sh, EXP_COLS);
  sh.getRange(5, 8).setBackground('#ffffff').setBorder(false, false, false, false, false, false);

  // entry table (A:G)
  var entry = sh.getRange(SB_FIRST, 1, n, 7);
  entry.setBorder(null, null, null, null, null, true, SB_LINE, SpreadsheetApp.BorderStyle.SOLID);
  [[1, 'ddd, mmm d, yyyy'], [6, '$#,##0.00']].forEach(function (f) {
    sh.getRange(SB_FIRST, f[0], n, 1).setNumberFormat(f[1]);
  });
  alignBody_(sh, EXP_COLS.slice(0, 7), last);
  sh.getRange(SB_FIRST, 1, n, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(true)
    .setHelpText('Enter a date like 10/11/2026').build());
  sh.getRange(SB_FIRST, 2, n, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(CATEGORIES, true).setAllowInvalid(true).build());
  sh.getRange(SB_FIRST, 5, n, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(METHODS, true).setAllowInvalid(true).build());
  sh.getRange(SB_FIRST, 6, n, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireNumberGreaterThanOrEqualTo(0).setAllowInvalid(true)
    .setHelpText('Numbers only, no $ sign needed').build());
  sh.getRange(SB_FIRST, 4, n, 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  sh.getRange(SB_FIRST, 7, n, 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  var band = sh.getRange(SB_FIRST, 1, n, 7).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);
  band.setFirstRowColor('#ffffff').setSecondRowColor(SB_BAND);

  // category summary (I:K), formulas only, so it fills itself
  var k = CATEGORIES.length;
  var cat = '$B$' + SB_FIRST + ':$B';
  var rows = [];
  for (var i = 0; i < k; i++) {
    var r = SB_FIRST + i;
    rows.push([CATEGORIES[i],
      '=SUMIFS(' + amt + ',' + cat + ',I' + r + ')',
      '=IF(SUM(' + amt + ')=0,0,J' + r + '/SUM(' + amt + '))']);
  }
  sh.getRange(SB_FIRST, 9, k, 3).setValues(rows).setBackground('#ffffff');
  sh.getRange(SB_FIRST, 10, k, 1).setNumberFormat('$#,##0.00').setHorizontalAlignment('right');
  sh.getRange(SB_FIRST, 11, k, 1).setNumberFormat('0%').setHorizontalAlignment('center');
  sh.getRange(SB_FIRST, 9, k, 1).setHorizontalAlignment('left').setFontWeight('bold');
  sh.getRange(SB_FIRST, 9, k, 3).setBorder(null, null, null, null, null, true, SB_LINE, SpreadsheetApp.BorderStyle.SOLID);
  var tr = SB_FIRST + k;
  sh.getRange(tr, 9, 1, 3).setValues([['Total', '=SUM(J' + SB_FIRST + ':J' + (tr - 1) + ')', '=IF(J' + tr + '=0,0,1)']])
    .setBackground(SB_NAVY2).setFontColor('#ffffff').setFontWeight('bold');
  sh.getRange(tr, 10).setNumberFormat('$#,##0.00').setHorizontalAlignment('right');
  sh.getRange(tr, 11).setNumberFormat('0%').setHorizontalAlignment('center');
  sh.getRange(tr + 1, 9, 1, 3).merge().setValue('Anything in a custom category shows in the entry table but not here.')
    .setFontSize(8).setFontColor('#7a869c').setWrap(true);
  sh.setConditionalFormatRules([SpreadsheetApp.newConditionalFormatRule()
    .setGradientMaxpoint('#9fc0ff').setGradientMinpoint('#ffffff')
    .setRanges([sh.getRange(SB_FIRST, 11, k, 1)]).build()]);

  applyWidths_(sh, EXP_COLS);
  sh.setFrozenRows(5);
  sh.setFrozenColumns(0);
  if (sh.getFilter()) sh.getFilter().remove();
  sh.getRange(5, 1, last - 4, 7).createFilter();
  sh.setTabColor('#c0392b');
}

// =====================================================================
//  WEB APP  (the website talks to these two functions)
// =====================================================================

function doGet(e) {
  var p = (e && e.parameter) || {};
  var action = p.action || '';
  try {
    if (action === 'config') return json_(getConfig_());
    if (action === 'debug') return json_(debugInfo_());
    if (action === 'analytics') { requireToken_(p.token); return json_(getAnalytics_()); }
    if (action === 'recentbookings') { requireToken_(p.token); return json_({ bookings: recentBookings_() }); }
    return json_({ busy: busyEvents_() });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  var p = (e && e.parameter) || {};
  var action = p.action || '';
  try {
    if (action === 'pageview' || action === 'heartbeat') { track_(action, p.page, p.session); return json_({ ok: true }); }
    if (action === 'setbookingsopen') {
      requireToken_(p.token);
      PropertiesService.getScriptProperties().setProperty('bookingsOpen', String(p.open) === 'true' ? 'true' : 'false');
      return json_({ ok: true });
    }
    if (action === 'setmessage') {
      requireToken_(p.token);
      PropertiesService.getScriptProperties().setProperty('siteMessage', String(p.message || '').slice(0, 500));
      return json_({ ok: true });
    }
    if (action === 'deletebooking') { requireToken_(p.token); return json_(deleteBooking_(p)); }
    return json_(addBooking_(p));
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function requireToken_(t) {
  if (String(t || '') !== SB_DEV_TOKEN) throw new Error('Not authorised');
}

// ---------- config ----------
function getConfig_() {
  var pr = PropertiesService.getScriptProperties();
  return { bookingsOpen: pr.getProperty('bookingsOpen') !== 'false', siteMessage: pr.getProperty('siteMessage') || '' };
}

// ---------- analytics ----------
function track_(action, page, session) {
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var pr = PropertiesService.getScriptProperties();
    var now = Date.now();
    var sessions = JSON.parse(pr.getProperty('sessions') || '{}');
    if (session) sessions[String(session).slice(0, 40)] = now;
    Object.keys(sessions).forEach(function (k) { if (now - sessions[k] > 120000) delete sessions[k]; });
    pr.setProperty('sessions', JSON.stringify(sessions));
    if (action === 'pageview') {
      var day = Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd');
      var d = JSON.parse(pr.getProperty('pvToday') || '{}');
      if (d.day !== day) d = { day: day, n: 0 };
      d.n++;
      pr.setProperty('pvToday', JSON.stringify(d));
      pr.setProperty('pvAll', String((parseInt(pr.getProperty('pvAll'), 10) || 0) + 1));
    }
  } finally { lock.releaseLock(); }
}
function getAnalytics_() {
  var pr = PropertiesService.getScriptProperties();
  var now = Date.now();
  var sessions = JSON.parse(pr.getProperty('sessions') || '{}');
  var active = Object.keys(sessions).filter(function (k) { return now - sessions[k] <= 90000; }).length;
  var day = Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd');
  var d = JSON.parse(pr.getProperty('pvToday') || '{}');
  return { activeNow: active, pageviewsToday: d.day === day ? d.n : 0, pageviewsAllTime: parseInt(pr.getProperty('pvAll'), 10) || 0 };
}

// ---------- calendar ----------
function calendar_() {
  var found = CalendarApp.getCalendarsByName(SB_CALENDAR_NAME);
  return found.length ? found[0] : CalendarApp.getDefaultCalendar();
}
function busyEvents_() {
  var tz = 'America/Chicago';
  var from = new Date();
  from.setHours(0, 0, 0, 0);
  var to = new Date(from.getTime() + SB_BUSY_DAYS * 86400000);
  var out = [];
  var events = calendar_().getEvents(from, to);
  events.forEach(function (ev) {
    try {
      if (ev.isAllDayEvent()) {
        // one entry per day so multi-day blocks grey out every day (dates read in Chicago time)
        var d = new Date(ev.getAllDayStartDate());
        var end = new Date(ev.getAllDayEndDate());
        var guard = 0;
        while (d < end && guard++ < 120) {
          var day = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
          out.push({ start: day + 'T00:00:00', end: day + 'T23:59:59', allDay: true, day: day });
          d = new Date(d.getTime() + 86400000);
        }
      } else {
        out.push({ start: ev.getStartTime().toISOString(), end: ev.getEndTime().toISOString(), allDay: false });
      }
    } catch (err) { /* skip a problem event, keep the rest */ }
  });
  return out;
}

// Open  <your /exec URL>?action=debug  in a browser to see what the script sees.
function debugInfo_() {
  var cals = CalendarApp.getCalendarsByName(SB_CALENDAR_NAME);
  var cal = calendar_();
  var busy = busyEvents_();
  return {
    scriptTimeZone: Session.getScriptTimeZone(),
    calendarsNamedSoapyBros: cals.length,
    usingCalendar: cal.getName(),
    busyEntries: busy.length,
    firstFew: busy.slice(0, 5)
  };
}

// ---------- bookings ----------
function bookingsSheet_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Bookings');
  if (!sh) throw new Error('Bookings tab missing. Run setupSoapyBrosSheet().');
  return sh;
}
function safe_(v) {
  var s = String(v == null ? '' : v).replace(/[\r\n]+/g, ' ').trim().slice(0, 600);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
function hhmm_(s) {
  var m = /^(\d{1,2}):(\d{2})/.exec(String(s || ''));
  return m ? { h: +m[1], m: +m[2] } : null;
}
function label_(t) {
  var h = t.h % 12 === 0 ? 12 : t.h % 12;
  return h + (t.m ? ':' + (t.m < 10 ? '0' : '') + t.m : ':00') + ' ' + (t.h < 12 ? 'AM' : 'PM');
}
function nextRow_(sh) {
  var vals = sh.getRange(SB_FIRST, 3, sh.getMaxRows() - SB_FIRST + 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) if (vals[i][0] === '') return SB_FIRST + i;
  sh.insertRowsAfter(sh.getMaxRows(), 50);
  return SB_FIRST + vals.length;
}

function addBooking_(p) {
  if (p._honey) return { ok: true };           // bot trap
  if (!p.Name || !p.Phone) return { ok: false, error: 'Missing name or phone' };

  var dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(p['Preferred date'] || ''));
  var st = hhmm_(p['Preferred time']);
  var en = hhmm_(p['Slot end']) || (st ? { h: st.h + SB_SLOT_HOURS, m: st.m } : null);
  var dateObj = dm ? new Date(+dm[1], +dm[2] - 1, +dm[3]) : '';
  var start = null, end = null;
  if (dm && st) {
    start = new Date(+dm[1], +dm[2] - 1, +dm[3], st.h, st.m);
    end = new Date(+dm[1], +dm[2] - 1, +dm[3], en.h, en.m);
  }
  var timeText = st ? label_(st) + ' - ' + label_(en) : '';
  var quote = '';
  var qm = /\$\s*([\d,]+(?:\.\d+)?)/.exec(String(p['Starting price'] || ''));
  if (qm) quote = parseFloat(qm[1].replace(/,/g, ''));
  var notes = safe_(p.Notes);

  var conflict = false;
  var cal = calendar_();
  if (start) conflict = cal.getEvents(start, end).length > 0;
  if (conflict) notes = ('CHECK: time overlaps another event. ' + notes).trim();

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  var row;
  try {
    var sh = bookingsSheet_();
    row = nextRow_(sh);
    sh.getRange(row, 1, 1, 15).setValues([[
      new Date(), 'New', safe_(p.Name), safe_(p.Phone), safe_(p.Email), dateObj, timeText,
      safe_(p['Car type']), safe_(p['Service type']), safe_(p['Add-ons'] || p['Add-on']), quote,
      safe_(p.Address), safe_(p.City), safe_(p['Zip code']), notes
    ]]);
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }

  if (start) {
    try {
      var addr = [p.Address, p.City, 'IA', p['Zip code']].filter(String).join(', ');
      var desc = ['Phone: ' + p.Phone, 'Email: ' + (p.Email || '-'), 'Vehicle: ' + (p['Car type'] || '-'),
                  'Service: ' + (p['Service type'] || '-'), (p['Add-ons'] || p['Add-on']) ? 'Add-ons: ' + (p['Add-ons'] || p['Add-on']) : '',
                  'Quote: ' + (p['Starting price'] || '-'), 'Notes: ' + (p.Notes || '-')].filter(String).join('\n');
      var ev = cal.createEvent('Soapy Bros: ' + p.Name + ' (' + (p['Service type'] || 'detail') + ')', start, end,
                               { description: desc, location: addr });
      bookingsSheet_().getRange(row, 3).setNote('eventId:' + ev.getId());
    } catch (err) { /* sheet row is saved even if the calendar call fails */ }
  }
  return { ok: true, conflict: conflict };
}

function recentBookings_() {
  var sh = bookingsSheet_();
  var n = sh.getMaxRows() - SB_FIRST + 1;
  var vals = sh.getRange(SB_FIRST, 1, n, 15).getValues();
  var tz = 'America/Chicago';
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var v = vals[i];
    if (v[2] === '') continue;
    var d = v[5] instanceof Date ? Utilities.formatDate(v[5], tz, 'yyyy-MM-dd') : '';
    var parts = String(v[6]).split(' - ');
    out.push({
      row: SB_FIRST + i, name: v[2], phone: v[3], email: v[4],
      preferredDate: d, preferredTime: parts[0] || '', slotEnd: parts[1] || '',
      appointment: (v[5] instanceof Date ? Utilities.formatDate(v[5], tz, 'EEEE, MMMM d, yyyy') + ', ' : '') + String(v[6]).replace(' - ', ' to '),
      carType: v[7], service: v[8], addon: v[9], quote: v[10],
      address: v[11], city: v[12], zip: v[13], notes: v[14], status: v[1],
      submitted: v[0] instanceof Date ? v[0].toISOString() : ''
    });
  }
  return out.reverse().slice(0, 200);   // newest first
}

function deleteBooking_(p) {
  var sh = bookingsSheet_();
  var row = parseInt(p.row, 10);
  if (!row || row < SB_FIRST || row > sh.getMaxRows()) return { ok: false, error: 'Bad row' };
  var cell = sh.getRange(row, 3);
  if (String(cell.getValue()).replace(/^'/, '') !== String(p.name || '')) {
    return { ok: false, error: 'Row changed. Reload the list and try again' };
  }
  var note = cell.getNote() || '';
  var m = /eventId:(\S+)/.exec(note);
  if (m) {
    try { var ev = calendar_().getEventById(m[1]); if (ev) ev.deleteEvent(); } catch (err) { /* ignore */ }
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    sh.getRange(row, 1, 1, 15).clearContent().clearNote();
    sh.deleteRow(row);
    sh.insertRowsAfter(sh.getMaxRows(), 1);   // keep the formatted buffer the same size
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
  try { syncIncome_(); } catch (err) { /* ignore */ }
  return { ok: true };
}

// =====================================================================
//  INCOME  (rows appear automatically when a booking is marked Completed)
// =====================================================================

function formatIncome_(sh) {
  var N = INC_COLS.length;
  prepareGrid_(sh, N);
  var last = sh.getMaxRows();
  var n = last - SB_FIRST + 1;
  titleBlock_(sh, N, 'SOAPY BROS  |  Income',
    'A row is added here automatically when you set a booking to Completed on the Bookings tab. Change the amount if the final price differed.');
  sh.setRowHeight(3, 40); sh.setRowHeight(4, 8);
  var amt = '$F$' + SB_FIRST + ':$F';
  var dt  = '$A$' + SB_FIRST + ':$A';
  kpi_(sh, 3, 1, 2, '="Total income:  "&TEXT(SUM(' + amt + '),"$#,##0.00")', '#d9f2e3');
  kpi_(sh, 3, 3, 4, '="This month:  "&TEXT(SUMIFS(' + amt + ',' + dt + ',">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1)),"$#,##0.00")', '#fff4d6');
  kpi_(sh, 3, 5, 6, '="Jobs paid:  "&COUNT(' + amt + ')', '#e8effb');
  kpi_(sh, 3, 7, 8, '="Average job:  "&IFERROR(TEXT(AVERAGE(' + amt + '),"$#,##0.00"),"-")', '#e8effb');
  sh.getRange(4, 1, 1, N).setBackground('#ffffff');
  headerRow_(sh, INC_COLS);
  sh.getRange(SB_FIRST, 1, n, N).setBorder(null, null, null, null, null, true, SB_LINE, SpreadsheetApp.BorderStyle.SOLID);
  alignBody_(sh, INC_COLS, last);
  sh.getRange(SB_FIRST, 1, n, 1).setNumberFormat('ddd, mmm d, yyyy');
  sh.getRange(SB_FIRST, 6, n, 1).setNumberFormat('$#,##0.00');
  sh.getRange(SB_FIRST, 7, n, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(METHODS, true).setAllowInvalid(true).build());
  sh.getRange(SB_FIRST, 8, n, 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  var band = sh.getRange(SB_FIRST, 1, n, N).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);
  band.setFirstRowColor('#ffffff').setSecondRowColor(SB_BAND);
  applyWidths_(sh, INC_COLS);
  sh.setFrozenRows(5);
  sh.setFrozenColumns(0);
  if (sh.getFilter()) sh.getFilter().remove();
  sh.getRange(5, 1, last - 4, N).createFilter();
  sh.setTabColor('#1e8e5a');
}

// Runs when you edit a cell. Keeps the Income tab in step with the Status and Quote columns.
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    var sh = e.range.getSheet();
    if (sh.getName() !== 'Bookings' || e.range.getLastRow() < SB_FIRST) return;
    var c1 = e.range.getColumn(), c2 = e.range.getLastColumn();
    if ((c1 <= 2 && c2 >= 2) || (c1 <= 11 && c2 >= 11)) syncIncome_();
  } catch (err) { /* never block an edit */ }
}

function syncIncome_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var bk = ss.getSheetByName('Bookings'), inc = ss.getSheetByName('Income');
  if (!bk || !inc) return;
  var vals = bk.getRange(SB_FIRST, 1, bk.getMaxRows() - SB_FIRST + 1, 15).getValues();
  var want = {};
  vals.forEach(function (v) {
    if (v[2] === '' || v[1] !== 'Completed') return;
    var key = v[0] instanceof Date ? String(v[0].getTime())
            : 'm:' + v[2] + '|' + v[3] + '|' + (v[5] instanceof Date ? v[5].getTime() : '');
    want[key] = {
      date: v[5] instanceof Date ? v[5] : (v[0] instanceof Date ? v[0] : new Date()),
      name: v[2], service: v[8], vehicle: v[7], amount: v[10] === '' ? 0 : v[10],
      notes: v[9] ? 'Add-ons: ' + v[9] : ''
    };
  });

  var rows = inc.getMaxRows() - SB_FIRST + 1;
  var names = inc.getRange(SB_FIRST, 2, rows, 1);
  var have = {};   // key -> sheet row
  var notes = names.getNotes();
  for (var i = rows - 1; i >= 0; i--) {
    var m = /^booking:(.+)$/.exec(notes[i][0] || '');
    if (!m) continue;
    if (!want[m[1]]) {                       // no longer Completed (or deleted): remove its income row
      inc.deleteRow(SB_FIRST + i);
      inc.insertRowsAfter(inc.getMaxRows(), 1);
    }
  }
  rows = inc.getMaxRows() - SB_FIRST + 1;
  names = inc.getRange(SB_FIRST, 2, rows, 1);
  notes = names.getNotes();
  var nvals = names.getValues();
  var empty = -1;
  for (i = 0; i < rows; i++) {
    var mm = /^booking:(.+)$/.exec(notes[i][0] || '');
    if (mm) have[mm[1]] = SB_FIRST + i;
  }
  Object.keys(want).forEach(function (key) {
    var w = want[key];
    if (have[key]) {
      var cell = inc.getRange(have[key], 6);
      if (cell.getValue() !== w.amount) cell.setValue(w.amount);
      return;
    }
    for (var j = 0; j < nvals.length; j++) if (nvals[j][0] === '') { empty = SB_FIRST + j; break; }
    if (empty < 0) { inc.insertRowsAfter(inc.getMaxRows(), 50); empty = inc.getMaxRows() - 49; nvals = nvals.concat(new Array(50).fill(['']).map(function () { return ['']; })); nvals[empty - SB_FIRST] = ['']; }
    inc.getRange(empty, 1, 1, 8).setValues([[w.date, w.name, w.service, w.vehicle, 'Soapy Bros', w.amount, '', w.notes]]);
    inc.getRange(empty, 2).setNote('booking:' + key);
    nvals[empty - SB_FIRST] = [w.name];
    empty = -1;
  });
}
