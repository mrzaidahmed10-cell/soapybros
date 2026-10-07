/**
 * Soapy Bros: additions for the existing Google Apps Script (the one at the /exec URL the website calls).
 *
 * WHAT THIS ADDS
 *   1. Calendar appointments are 2 hours long (SB_SLOT_HOURS).
 *   2. recentbookings returns each request's sheet row so the dev portal can show and delete it.
 *   3. deletebooking removes a request from the sheet and its calendar event.
 *   4. sbShrinkThreeHourEvents() optionally trims old 3-hour events to 2 hours (dry run by default).
 *
 * HOW TO INSTALL (about 5 minutes)
 *   A. In your Apps Script project, add a new file (File > + > Script), name it SoapyBrosAdditions, paste all of this.
 *   B. Set SB_SHEET_NAME below to the tab name that holds booking requests.
 *   C. Project Settings: set the time zone to America/Chicago so dates and times line up with the website.
 *   D. In your existing doGet, make the 'recentbookings' branch return:
 *        return sbJson_(sbRecentBookings_());
 *      (keep whatever token check it already does).
 *   E. In your existing doPost, add this branch next to setmessage / setbookingsopen:
 *        if (e.parameter.action === 'deletebooking') {
 *          if (e.parameter.token !== SB_TOKEN) return sbJson_({ ok: false, error: 'not authorized' });
 *          return sbJson_(sbDeleteBooking_(e.parameter));
 *        }
 *   F. Find the line in your existing code that creates the calendar event, it looks like
 *        calendar.createEvent(title, start, end, ...)
 *      and make the end time two hours after the start:
 *        calendar.createEvent(title, start, sbEnd_(start), ...)
 *      The website now also sends "Slot end" (for example 12:00) and "Slot length" (2 hours) with each booking.
 *   G. Deploy > Manage deployments > pencil icon > Version: New version > Deploy.
 *      The /exec URL stays the same, so the website needs no change.
 *
 * Not tested against your real script or sheet, because the script is only reachable from your Google account.
 */

var SB_SLOT_HOURS = 2;
var SB_SHEET_NAME = 'Sheet1';      // change to your bookings tab
var SB_TOKEN = '!soapybros';       // same value the dev portal sends; reuse your existing token check if you have one

function sbJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function sbEnd_(start) {
  return new Date(start.getTime() + SB_SLOT_HOURS * 3600 * 1000);
}

// The website sends the date as 2026-10-11 and the start time as 10:00.
function sbStart_(dateStr, timeStr) {
  var d = String(dateStr).slice(0, 10).split('-'), t = String(timeStr).split(':');
  return new Date(+d[0], +d[1] - 1, +d[2], +t[0], +(t[1] || 0), 0);
}

function sbCamel_(header) {
  var words = String(header).trim().replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/);
  return words.map(function (w, i) { w = w.toLowerCase(); return i ? w.charAt(0).toUpperCase() + w.slice(1) : w; }).join('');
}

function sbSheet_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SB_SHEET_NAME);
  if (!sheet) throw new Error('Sheet tab not found: ' + SB_SHEET_NAME);
  return sheet;
}

// Newest first, at most 50. Each item has the header names in camelCase plus "row" (the sheet row number).
function sbRecentBookings_() {
  var sheet = sbSheet_(), last = sheet.getLastRow();
  if (last < 2) return { bookings: [] };
  var values = sheet.getRange(1, 1, last, sheet.getLastColumn()).getValues();
  var keys = values[0].map(sbCamel_), out = [];
  for (var r = values.length - 1; r >= 1 && out.length < 50; r--) {
    var o = { row: r + 1 };
    keys.forEach(function (k, c) {
      var v = values[r][c];
      o[k] = v instanceof Date ? Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm") : v;
    });
    out.push(o);
  }
  return { bookings: out };
}

// Removes the sheet row (after checking it is the same customer) and the matching calendar event.
function sbDeleteBooking_(p) {
  var sheet = sbSheet_(), row = parseInt(p.row, 10), last = sheet.getLastRow();
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(sbCamel_);
  var nameCol = headers.indexOf('name');
  var want = String(p.name || '').trim().toLowerCase();
  if (!(row >= 2 && row <= last)) return { ok: false, error: 'row not found' };
  if (nameCol >= 0 && want && String(sheet.getRange(row, nameCol + 1).getValue()).trim().toLowerCase() !== want) {
    return { ok: false, error: 'that row changed, refresh and try again' };
  }
  var calendarDeleted = 0;
  if (p.date && p.time) {
    var start = sbStart_(p.date, p.time);
    var events = CalendarApp.getDefaultCalendar().getEvents(new Date(start.getTime() - 3600 * 1000), new Date(start.getTime() + 4 * 3600 * 1000));
    var matches = events.filter(function (ev) {
      return want && (ev.getTitle().toLowerCase().indexOf(want) >= 0 || (ev.getDescription() || '').toLowerCase().indexOf(want) >= 0);
    });
    if (matches.length === 1) { matches[0].deleteEvent(); calendarDeleted = 1; }   // only when it is unambiguous
  }
  sheet.deleteRow(row);
  return { ok: true, calendarDeleted: calendarDeleted };
}

// Optional clean-up: trims future 3-hour events (8-11, 11-2, 2-5, 5-8) down to 2 hours.
// Run sbShrinkThreeHourEvents() once and read the log. Run sbShrinkThreeHourEvents(false) to apply it.
function sbShrinkThreeHourEvents(dryRun) {
  dryRun = dryRun !== false;
  var now = new Date(), until = new Date(now.getTime() + 90 * 24 * 3600 * 1000), n = 0;
  CalendarApp.getDefaultCalendar().getEvents(now, until).forEach(function (ev) {
    if (ev.isAllDayEvent()) return;
    if (ev.getEndTime() - ev.getStartTime() === 3 * 3600 * 1000) {
      Logger.log((dryRun ? 'Would shorten: ' : 'Shortened: ') + ev.getTitle() + ' ' + ev.getStartTime());
      if (!dryRun) ev.setTime(ev.getStartTime(), sbEnd_(ev.getStartTime()));
      n++;
    }
  });
  Logger.log((dryRun ? 'Dry run: ' : 'Done: ') + n + ' event(s).');
}
