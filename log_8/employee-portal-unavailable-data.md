# Employee Portal Unavailable Data

| UI area | Missing data | Current state | This phase | Follow-up |
| --- | --- | --- | --- | --- |
| Employee profile | Avatar, DOB, gender, phone, addresses | No `employees` columns | Chưa có dữ liệu | Add employee personal-profile fields and controlled file storage |
| Identity and benefits | ID, tax, insurance, bank, emergency contact, allowance/debt breakdown | No dedicated schema/read model | Chưa có dữ liệu | Add normalized HR personal and compensation tables |
| Resume | Education and work history | No schema | Chưa có dữ liệu | Add employee education and experience tables |
| Employment contracts | Contract files and employment period metadata | Business contracts are not employment contracts | Chưa có dữ liệu | Add employment-contract table and documents |
| Leave | Reason, requested days, submitted timestamp | `LeaveRecord` only has type, dates, status | Show stored dates/status; other fields unavailable | Extend leave request schema |
| Leave dashboard panel | Annual leave quota and create-leave-request action | No quota policy or employee leave-request endpoint | Show `Chưa có dữ liệu`; disable action | Add leave entitlement model and protected create-request endpoint |
| Weekly schedule | Shift, time range, calendar allocation | `ProjectTask` has no shift/time model | Chưa có dữ liệu | Add employee schedule events |
| Attendance action | Location, note, manual check-in | Attendance is ingest-only | Show disabled check-in/out action | Define manual attendance policy and schema |
| Employee dashboard content | Announcements, documents, handbook, organization tree | No source model/API | Chưa có dữ liệu | Add content and org-chart read models |
