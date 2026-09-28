# SHAW PROJECT CMS

Build a production-style internal web application called:

“SHAW Test & Commissioning (T&C) Management System”

This is for a construction project T&C monitoring workflow. The app must prioritize data integrity, maintainable architecture, role-based access control, Excel import/export, direct mobile field updates, auditability, and clear operational monitoring.

IMPORTANT GLOBAL RULES
- ALL UI labels, button texts, table headers, messages, status labels, page titles, and technical terms MUST be entirely in English.
- Use a clean, professional sans-serif font such as Inter, Arial, or Roboto.
- The visual style must feel like a serious internal construction operations platform, not a startup marketing app.
- Prioritize robust backend logic and usable internal workflows over visual decoration.
- Build this as a real internal operations app, not a mockup.

==================================================
1. CORE BUSINESS CONCEPT
==================================================

This application manages construction Test & Commissioning records.

Definitions:
- One legacy Excel row represents one Test.
- One Test may contain multiple MOS codes.
- The real database tracking unit is Subtest.
- One Subtest = Item No + MOS Code.
- Example:
  - Test = PSG-008
  - MOS Codes = MST-007, MST-027
  - Subtests = PSG-008-MST-007 and PSG-008-MST-027

Database tracking unit:
- Use Subtest as the core transactional record.

Business key:
- Project + System + Item No + MOS Code

Project:
- Start with one project: SHAW
- But design the schema so multiple projects can be supported later.

==================================================
2. OPERATIONAL RULES
==================================================

T1 / T2 meaning:
- T1 = Internal Test
- T2 = RTO Witness Test
- T1 happens first, then T2 sequentially

Status values:
- Allowed values for T1 Status and T2 Status:
  - Blank
  - Planned
  - WIP
  - Done
  - Hold
- In the database, Blank should be stored as NULL.
- In the UI, use dropdown menus only.

MOS:
- For now, MOS is only a simple code.
- Do not build a full MOS master module yet.
- But keep the schema extensible so a MOS master can be added later.

==================================================
3. DATA MODEL
==================================================

Use Supabase/Postgres with proper relational structure, constraints, indexes, audit logs, and clean TypeScript typing.

Create the following tables.

A. MASTER TABLES

1) projects
- id
- project_code
- project_name
- is_active
- created_at

2) system_master
- id
- project_id
- system_code
- system_name_std
- discipline
- is_auto_created
- auto_created_at
- auto_created_by
- requires_admin_review
- is_active
- created_at

3) system_alias_map
- id
- project_id
- alias_name
- system_id
- is_active
- created_at

B. CORE BUSINESS TABLES

4) tests
- id
- project_id
- system_id
- item_no
- level
- equipment
- description
- source_seed_row_no
- is_active
- created_at
- updated_at

5) subtests
- id
- project_id
- system_id
- test_id
- item_no
- mos_code
- mos_sequence
- subtest_id
- level
- equipment
- description
- t1_planned_date
- t1_actual_date
- t1_status
- t2_planned_date
- t2_actual_date
- t2_status
- r1_status
- aconex_ref_no
- r2_status
- remarks
- punchlist_comments
- source_upload_id
- data_source_type
- updated_by
- updated_at
- row_version
- is_active

Unique constraints:
- unique(project_id, system_id, item_no, mos_code)
- unique(subtest_id)

Subtest ID format:
- Item No + "-" + MOS Code
- Example: PSG-008-MST-007

data_source_type values:
- legacy_import_inherited
- app_direct_input
- mobile_input
- standard_import
- admin_edit

C. USER / PERMISSION TABLES

6) users
- id
- name
- email
- role
- is_active
- created_at

7) user_system_permissions
- id
- user_id
- project_id
- system_id
- can_view
- can_edit
- can_import
- can_create_key
- can_export
- granted_by
- granted_at

D. IMPORT / FILE TRACKING TABLES

8) upload_batches
- id
- project_id
- uploaded_file_name
- uploaded_by
- uploaded_at
- source_type
- import_type
- template_version
- total_rows
- processed_rows
- success_rows
- skipped_rows
- rejected_rows
- status
- note

9) upload_row_logs
- id
- upload_id
- raw_row_no
- raw_system_name
- mapped_system_id
- item_no
- mos_code
- action_taken
- reason_code
- reason_detail
- processed_at

E. AUDIT TABLES

10) subtest_change_log
- id
- subtest_id
- changed_field
- old_value
- new_value
- changed_by
- changed_at
- change_source
- upload_id

F. UI / FIELD CONFIGURATION TABLES

11) field_config
- id
- field_name
- display_name
- is_enabled
- is_required
- visible_to_roles
- editable_to_roles
- sort_order

==================================================
4. SUBTEST FIELDS REQUIRED IN THE APP
==================================================

The following fields must exist at Subtest level, and Admin must be able to enable/disable them in the UI:

- System
- Item No
- Subtest ID
- MOS Code
- MOS Sequence
- Level
- Equipment
- Description
- T1 Planned Date
- T1 Actual Date
- T1 Status
- T2 Planned Date
- T2 Actual Date
- T2 Status
- R1 Status
- Aconex Ref No
- R2 Status
- Remarks
- Punchlist Comments
- Updated By
- Updated At
- Source Upload ID
- Data Source

==================================================
5. USER ROLES
==================================================

Roles:
- Subcontractor
- HDEC Engineer
- Manager
- Superuser
- Admin

Permission principle:
- Permissions are controlled strictly by standardized System values.
- Users can only view/edit/import/export records for Systems assigned to them.
- Permission checking must happen after imported raw System values are normalized to System Master.

Suggested role behavior:

Subcontractor
- Can view assigned systems only
- Can edit assigned Subtests through the app
- Can use mobile quick update if allowed
- Import may be allowed only if explicitly granted
- Cannot create new keys

HDEC Engineer
- Can view assigned systems only
- Can edit assigned Subtests
- Can use mobile quick update
- Import may be allowed if granted
- Cannot create new keys

Manager
- Can view/edit assigned systems
- Can import
- Can export
- Can create new keys

Superuser
- Full view/edit/import/export across all systems
- Can create new keys

Admin
- Full control
- Manage users
- Manage permissions
- Manage system master and aliases
- Manage field visibility
- Review import logs
- Review audit logs
- Manage auto-created systems
- Can create new keys

==================================================
6. IMPORT LOGIC
==================================================

The app must support TWO import modes.

----------------------------------
A. LEGACY IMPORT MODE
----------------------------------

This supports the existing site Excel format where:
- one row = one Test
- MOS-1 to MOS-5 may exist in the same row
- T1/T2 fields appear only once at Test level

Legacy import logic:
- Parse one Excel row as one Test
- Read MOS-1 to MOS-5
- Explode one Test row into multiple Subtests
- For each generated Subtest:
  - copy the same Test-level T1/T2 values to all Subtests under that Test
- Legacy import DOES NOT support different T1/T2 schedules for different Subtests under the same Test
- If different Subtests need different T1/T2 planned dates, actual dates, or statuses, that must be handled only through direct app input/editing

Important:
- Legacy Import = common T1/T2 distribution to all Subtests within the same Test
- Subtest-specific schedule management = app direct input only

----------------------------------
B. STANDARD IMPORT MODE
----------------------------------

Support a clean raw format where:
- 1 row = 1 Subtest
- This format should be compatible with the app’s raw Subtest export

==================================================
7. IMPORT UPSERT RULES
==================================================

Business key for matching:
- Project + System + Item No + MOS Code

Upsert logic:
- If the key exists, update the existing Subtest
- If the key does not exist:
  - allow creation only for Admin / Superuser / Manager
  - reject or skip for lower roles

Blank overwrite rule:
- Blank imported cells must NOT overwrite existing data

Clear rule:
- Only an explicit clear token may remove existing data
- Use this exact clear token:
  - clear
- Implement clear as case-insensitive if practical

Permission rule during import:
- If a file contains Systems the user is not permitted to update, those rows must be skipped
- Skipped rows must be logged with reason

System normalization during import:
- First map imported raw System name using system_alias_map
- If not found:
  - auto-create a new system_master record
  - mark it as is_auto_created = true
  - mark requires_admin_review = true
  - create alias mapping from raw imported name
- Then continue permission logic using the standardized system

==================================================
8. CONFLICT RESOLUTION
==================================================

Conflict rule:
- If app direct input and Excel import conflict, use latest updated_at timestamp
- Newer updated_at wins

Tie-break rule:
- If timestamps are exactly equal:
  1. app direct input wins over import
  2. admin_edit wins over normal import
  3. keep full audit log

Do NOT implement a blanket “Superuser/Admin import always overwrites everything regardless of timestamp”.
Timestamp priority must remain the core rule.

==================================================
9. EXPORT LOGIC
==================================================

Implement Excel export.

At minimum, provide:
1. Raw Subtest Export
- 1 row = 1 Subtest
- Includes all key fields and status/date fields
- Designed to be filtered and reusable

2. Export filters
- Project
- System
- Item No
- Subtest ID
- T1 Status
- T2 Status
- Updated By
- Updated Date Range

Optional but useful:
- A formatted operational export view for human-readable reporting

==================================================
10. AUDITABILITY
==================================================

Every meaningful field change must be traceable.

Track:
- who changed it
- when
- old value
- new value
- source of change

change_source values:
- app_direct_input
- mobile_input
- excel_import
- admin_edit

The Subtest detail page must show a useful change history section.

==================================================
11. UI / UX REQUIREMENTS
==================================================

Build a responsive application for desktop and mobile.

Overall style:
- professional
- clean
- high-density but readable
- suitable for construction project management teams
- no playful visuals
- no consumer-style design

Required screens/pages:

1. Login Page

2. Main Subtest List / Master DB View
Must include:
- data grid
- filters
- search
- import button
- export button
- visual tags for Data Source
- delayed item highlighting
- permission-aware actions

Filters required:
- Project
- System
- Item No
- Subtest ID
- T1 Status
- T2 Status
- Updated By
- Updated Date Range
- free text search

3. Subtest Detail / Edit Page
Must support:
- view/edit key operational fields
- T1 Planned Date
- T1 Actual Date
- T1 Status
- T2 Planned Date
- T2 Actual Date
- T2 Status
- R1 Status
- Aconex Ref No
- R2 Status
- Remarks
- Punchlist Comments
- Updated By
- Updated At
- Data Source
- change history

4. Mobile Quick Update Page
Must be optimized for field engineers:
- searchable list
- filter by System / Item No / Status
- quick open Subtest
- fast status/date update
- large tap targets
- fast save
- strict permission enforcement

5. Legacy Import Page
Must include:
- file upload
- template guidance
- validation summary
- import preview if possible
- result summary

6. Import Result / Import Log Page
Show:
- upload batch summary
- inserted / updated / skipped / rejected counts
- downloadable row log
- error reasons

7. Export Page

8. System Master Management Page

9. User & Permission Management Page

10. Field Configuration Page

11. Audit Log Page

==================================================
12. MASTER DB VIEW REQUIREMENTS
==================================================

The main operational table must behave like a strong internal master database screen.

Include:
- sortable columns
- filters
- pagination
- search
- row click to detail
- data source column
- visual badges for status
- clear indication of inherited legacy values vs directly edited values

Delayed highlight logic:
- highlight records where planned date exists and actual date is later than planned
- allow visual emphasis for lagging items

==================================================
13. EXECUTIVE DASHBOARD
==================================================

Create a separate Executive Dashboard page, but keep it lightweight compared to the core data module.

Dashboard should use data from the same master database.

A. Main Planned vs Actual Chart
Build an overlaid vertical bar chart by System:
- Planned = wider background bar
- Actual = narrower foreground bar
- show one group per System
- support tooltip with:
  - Planned Count
  - Actual Count
  - Variance Count
  - Completion %

Use completion logic:
- Completed Subtest = T2 Status = Done
- Planned Count = number of Subtests with a planned requirement in scope
- Actual Count = number of completed Subtests
- Variance Count = Planned Count - Actual Count
- Completion % = Actual Count / Planned Count

B. Alert Table 1: Critical Delays
Show items where:
- actual date > planned date
Use whichever phase is relevant:
- T1 actual > T1 planned
- or T2 actual > T2 planned
Show:
- System
- Item No
- Subtest ID
- Relevant phase
- Planned Date
- Actual Date
- Delay Days
- Updated By
- Updated At

C. Alert Table 2: Process Lag
Show items where:
- T1 Status = Done
AND
- T2 Planned Date is blank
OR
- T2 Planned Date is more than 3 days later than T1 Actual Date

Show:
- System
- Item No
- Subtest ID
- T1 Actual Date
- T2 Planned Date
- Gap Days
- Responsible User if available
- Updated At

==================================================
14. VALIDATION RULES
==================================================

Implement robust validation.

Examples:
- reject invalid status values
- reject invalid date formats
- reject rows with missing required key fields
- prevent unauthorized updates
- log all rejects clearly
- do not overwrite with blanks
- allow only the explicit clear token for deletion

==================================================
15. SEED / MIGRATION REQUIREMENTS
==================================================

Support migration from existing legacy Excel trackers.

Migration logic:
- parse legacy rows into Tests
- explode MOS-1 to MOS-5 into Subtests
- copy row-level T1/T2 values to all generated Subtests under the same Test
- preserve source upload metadata
- store data_source_type as legacy_import_inherited for inherited values

==================================================
16. TECHNICAL IMPLEMENTATION PREFERENCES
==================================================

Use:
- Supabase Auth
- Supabase Postgres
- TypeScript
- maintainable reusable components
- strong form validation
- clean table filtering
- stable CRUD flows
- useful empty states and error states

Please generate:
1. full application structure
2. database schema
3. Supabase integration
4. auth and role-based permission logic
5. system normalization logic
6. legacy import parser and workflow
7. standard import workflow
8. raw export workflow
9. main operational pages
10. executive dashboard page
11. audit logging
12. seed-ready migration logic


17. ADMIN WORKSPACE REQUIREMENT

Create a dedicated top-level “Admin” tab/menu visible only to Admin users.

Optionally allow Superuser to access a limited admin workspace if configured.

Inside the Admin tab, create the following sub-pages:

1. User Management

- register users

- activate/deactivate users

- assign roles

- reset access status if needed

2. Permission Management

- assign systems by user

- configure can_view, can_edit, can_import, can_create_key, can_export

- bulk assign permissions if possible

3. System Master Management

- create/edit/disable systems

- review auto-created systems

- approve or rename standardized system names

- manage alias mappings

4. Field Configuration

- enable/disable fields in the UI

- set required/optional fields

- control role-based visibility and editability

5. Import Settings

- manage accepted import modes

- manage clear token behavior

- review upload batch logs and row logs

6. Audit & Activity Logs

- review subtest change logs

- filter by user, system, date, and source

7. App Configuration

- project-level settings

- default status options

- other admin-controlled operational settings

The Admin tab must function as a central control panel for system administration, user registration, permission control, field activation/deactivation, and operational configuration.
Build this as a real internal operational system for T&C management, with excellent data integrity and clear workflow enforcement.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://shaw-tower-tnc.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/5e5a7b8e-c4af-4278-baec-3446e05cc4be).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
