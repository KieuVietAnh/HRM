# Mobile UI audit — 2026-10-01

Scope: presentation at widths ≤768px. Reference: existing `/employees`. No routing, permissions, services, calculations or handlers are to be changed. Desktop baseline: 1366px; mobile baseline: 390px. QA fixtures are intercepted locally and reject database writes.

## Route inventory and implementation plan

| Actual route | Source / styles | Existing UI and work |
| --- | --- | --- |
| `/employees` | EmployeeDirectory.jsx, index.css | Preserve main page exactly. Polish employee forms, nested dialogs and status-history subview only. |
| `/cham-cong-online` | OnlineAttendance.jsx / .css | Compact header, clock, location and punch cards; convert 11-column history to labelled cards. Keep camera/GPS/punch handlers. |
| `/bang-cong` | MyAttendance.jsx / .css | Reuse existing day cards; extend mobile cards to 768px; compact identity and statistics. |
| `/bang-cong-preview` | AttendancePreview.jsx / .css | Reuse summary/day-detail cards; compact action/filter area and import/reset dialogs. Preserve bounded horizontal scrolling for the day comparison matrix. |
| `/bang-phat` | AttendancePenalties.jsx / .css | Reuse editable mobile penalty cards, month selector and existing save/export/reset actions. |
| `/approvals` | Approvals.jsx / .css | Existing inbox, sent, templates, statistics, create, template-form and detail views; normalize cards, tabs, fields, picker/reject/stat-detail dialogs and action bars. |
| `/ngay-nghi-phep` | LeaveDays.jsx / .css | Compact header/form/search, replace three-column mobile table with labelled cards. |
| `/bang-phep` | LeaveBoard.jsx, EmployeeLeave.css | Employee cards with tenure, annual allowance and a 12-month grid instead of the wide mobile table. |
| `/holiday-settings` | HolidaySettings.jsx / .css, LeaveSettingsPanel.jsx, EmployeeLeave.css | Holidays, shifts, penalties, leave tabs; compact settings cards and single-column forms; retain editable month grids. |
| `/login` | Login.jsx / .css | Preserve auth; mobile brand/form spacing and input/toggle targets. |
| `/employee-login` | EmployeeLogin.jsx / .css | Preserve auth; align mobile card/form with employee reference. |
| `/dashboard`, `/recruitment`, `/salary`, `/competency`, `/kpi`, `/grading/:employeeId?`, `/tasks` | FeatureComingSoon.jsx, index.css | Shared placeholder screen only: normalize mobile container. Legacy feature files are not active routes. |
| `/`, `/attendance`, `/honor` | App.jsx | Existing redirects to employees / attendance preview; no changes. |

Shared sources: Layout.jsx, Header.jsx, Sidebar.jsx, EmployeeModal.jsx, StatusHistoryView.jsx, AttendanceImportModal.jsx, ResetAttendanceModal.jsx, index.css. Existing React/plain CSS; no new framework/component dependency. Existing CSS uses inconsistent mobile breakpoints (640, 760, 767, 768), oversized desktop table minimum widths, wrapping action rows and inline modal dimensions.

## Reused visual primitives

1. Buttons: existing SpeeGo primary/semantic colors, compact text, minimum 40px mobile target.
2. Inputs: existing border/radius, 44px height and 16px font for mobile typing.
3. Filters: compact labelled controls with existing state/handlers.
4. Cards: white, 12px radius, #e2e8f0 border, light employee-reference shadow.
5. Badges: existing semantic colors and compact labels.
6. Lists: independent cards, readable name/metadata, no table separators on mobile cards.
7. Dialogs: viewport-bounded width/height, internal scrolling and accessible existing actions.

Typography reuses the self-hosted Inter files already introduced for `/employees`. Page background #f8fafc, primary #0b3b75, secondary #ff5a1f, page inset 14px, card gap 10–12px. Rules are scoped inside a single ≤768px stylesheet. Main employee selectors are excluded.

## Phases

0. Audit router, shared components and route CSS; capture populated baseline screenshots.
1. Shared mobile primitives and online/personal/summary attendance and penalty screens.
2. Approval list, detail, create, template/stat views and dialogs.
3. Employee dialogs/history and holiday/shift/penalty/leave settings and leave lists.
4. Login, shared navigation and demo routes.
5. Responsive QA at 375/390/430/768/1366px, main employee preservation, desktop screenshot comparisons, existing source tests and production build. Iterate on observed problems.

Artifacts: `node_modules/.cache/system-mobile/{before,after}`. Runtime/API fixtures are QA-only; they do not establish that live production permissions or data have been exercised.
