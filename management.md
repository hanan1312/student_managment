# Students, Degrees & Users — Work Summary

This document covers what was built in this round of work on the school app: what changed for
users, how the main rules work, what changed in the data, and what is still open. The last
section is a technical reference for developers.

---

## 1. What the app shows now

The app was trimmed to the features in active use. Everything else (Finance, Time Table, Buses,
Inventory, HR & Staff, and the extra student tabs and fields) is **hidden, not deleted**. Its data
and code are kept and can be switched back on with one setting (`SHOW_EXTENDED_FEATURES` in
`client/src/lib/features.ts`).

Visible today:

- **شئون الطلاب → الطلاب**, with the ribbon buttons: طالب جديد، استيراد، تصدير، طباعة، المواد، ملف الدرجات، إضافة مدرسة، المستخدمين.
- **العام الدراسي** (Academic years): one card per year; the open year's students are what شئون الطلاب shows (see §2a).
- **الإعدادات** (Preferences). Its العام الدراسي now shows the open year (read-only).
- **التحكم** (Control), next to الإعدادات (see §7).
- **المستخدمين** (Users), opened from the Students ribbon.

The whole interface is in **Arabic** and laid out **right-to-left**.

**Moving table columns (optional):** in the app's tables (not print previews or the per-student
degrees editor), drag a column's header onto another header to
move that column there. Nothing changes until someone drags. The order is remembered per table in
that browser. The students table's **استعادة الافتراضي** also puts its columns back in their
default order. Selection checkboxes, row numbers (م) and action buttons stay where they are.

---

## 2. Students

### Student record (طالب جديد / تعديل)

**البيانات الأساسية**

| Field | Notes |
|---|---|
| الاسم | Required |
| النوع | ذكر / أنثى |
| الديانة | مسلم / مسيحي |
| نوع القيد | مستجد / غير مستجد |
| الجنسية | Free text, with suggestions (مصري، سوداني، …). Also a table column, in Import and Export |
| الرقم القومي | A full 14-digit ID fills in تاريخ الميلاد (see below) |
| كود الحكومة الالكترونية | Was "كود الوزارة". Import still accepts files with the old header |
| تاريخ الميلاد | Filled in from الرقم القومي; can still be changed by hand |
| السن في ١ أكتوبر | Calculated automatically (see below) |

**بيانات القبول**

| Field | Notes |
|---|---|
| التسكين | Where the student is placed in the Hierarchy (see §3) |
| المرحلة / الصف | Filled in from التسكين; not typed |
| المدرسة | Chosen from the schools added in **إضافة مدرسة** (see below). An older typed-in value stays selectable |

**Age rule:** age is shown in years, months and days on **1 October** of the year after the first
year of the academic year set in Preferences. For example, with "2026 / 2027" the age is worked out
on 1 October 2027.

**Birth date from الرقم القومي:** the first 7 digits of a 14-digit ID are the birth date: century
(2 = 1900s, 3 = 2000s), year, month, day. For example `28812131900228` → 13 December 1988
(2 → 1900, + 88 = 1988, month 12, day 13).

- Typing or pasting a full ID in the student form fills in تاريخ الميلاد. It can then be edited;
  changing the ID again fills it in again.
- On **Import**, a row with no تاريخ الميلاد gets it from its الرقم القومي.
- An ID that isn't 14 digits, or doesn't hold a real date (e.g. month 45), is ignored.
- Existing students were not changed.

### Schools (إضافة مدرسة)

Opened from **إضافة مدرسة** on the Students ribbon. It lists the schools and adds, edits or deletes them.

| Field | Notes |
|---|---|
| اسم المدرسة | Required. This is the list offered in البيانات الأساسية → المدرسة. Renaming a school renames it on every student in it |
| العنوان | |
| المدينة | From المستخدمين → مدينة |
| الإدارة | From المستخدمين → إدارة تعليمية |
| رقم التليفون | |

- **تصدير** saves the list to Excel. **استيراد** reads Excel or CSV with the same columns: a school
  whose name is already listed is updated (empty cells keep what it had), any other is added.
  المدينة and الإدارة are matched by name (ا / أ / إ spelled either way); a name that isn't in
  المستخدمين is left empty, with a warning in the preview.
- A school that students are in can't be deleted, and the last school can't be deleted.
- A city or education administration used by a school can't be deleted from المستخدمين.
- These are the same schools the HR screens use.

### Students table

- Columns can be shown or hidden with **الأعمدة**. Only fields that are currently enabled in the
  app are offered.
- New columns:
  - **مجموع الدرجات** shows the total of the student's degrees.
  - **النسبة المئوية** shows the percentage (see §5).
  - **المدرسة** and **الديانة** can be turned on from the column picker.
- **الإجراءات:** the print icon on a row opens that student's degrees certificate (see §5). It
  replaces the old بنود المصروفات button.
- **Pages:** the table shows **50 students per page**, with السابق / التالي and page numbers
  under the table. A group (المرحلة / الصف) split over two pages shows e.g. "(12 من 40)".
  - A new search or tree selection, or a column filter, goes back to page 1. Editing a student
    keeps the current page.
  - The select-all checkbox selects the **current page only**, so حذف المحدد never deletes rows
    that aren't on screen.

### Import / Export

- Both use the visible fields, with Arabic column headers.
- Older files with English headers still import.
- Gender and religion accept Arabic or English values (e.g. ذكر/M, مسلم/Muslim).
- The section column can hold either the full Hierarchy path or just the section name, if that
  name is unique.

### Print (طباعة)

**طباعة** opens a print preview of the students currently listed (the tree selection and
search apply, as for Export).

- **Header** on the printed sheet: school name, العام الدراسي, the sheet title, the school logo
  (from Preferences), **تاريخ الطباعة** (date and time) and the number of students.
- **المراحل:** a checkbox per division chooses which divisions are printed. Each division is
  printed as its own table, with its sections as heading rows.
- **Adjusting the table before printing:**
  - Edit the sheet title.
  - Choose the columns (starts from the table's current columns), hide one with ×, and move it
    right / left with the arrows in its header.
  - طولي / عرضي (portrait / landscape), font size, section heading rows on/off, and
    "كل مرحلة في صفحة جديدة" (each division on a new page).
  - Remove single rows from the printout with the × at the end of the row (hover). They can
    be brought back with "استعادة الصفوف المحذوفة". This only affects the printout.
- The table header repeats on every printed page. Row numbers (م) restart for each division.

---

## 2a. Academic years (العام الدراسي)

A tab next to التحكم. Each academic year is a card. **Students and their degrees belong to a year.**
Everything else (المواد, المدارس, the الهيكل tree, المستخدمين, الإعدادات, التحكم, and how ملف الدرجات is
set up) is shared by every year and is never reset when a year is added or opened.

| On a card | What it does |
|---|---|
| **عرض بيانات العام الدراسي** (green, left) | Opens the year: the card turns green and شئون الطلاب shows that year's students. A new year starts empty; students added from then on are stored in it. On an archived card it also takes the year out of the archive |
| **ارشيف** (red, right) | Archives the year: the card turns red and can't be opened until the green word is pressed again. Its data is kept |
| Checkbox | Selects the year for **حذف** |
| ✎ | Renames the year |

- **اضافة عام دراسي جديد** adds a year (the next one, e.g. "2027 / 2028", is suggested).
- **حذف** deletes the ticked years **with their students and degrees**, after a confirmation.
- The open year can't be archived or deleted; open another year first.
- The open year is the same for every user, and the age rule and the print headers use its name.
  It is shown in the footer. A screen left open from before another year was opened can't change
  students of the old year (it asks to reload).
- The students that existed before this change are in the first card, made from the العام الدراسي
  that was set in Preferences. A tab named "العام الدراسي" that was added earlier in التحكم was
  replaced by this one (its hidden / يتبع / name settings were kept).
- Who can add, open, archive or delete years: admins, the master account, and users given
  **العام الدراسي** in إدارة الصلاحيات.

---

## 3. Hierarchy (الهيكل → المراحل)

- **Classes removed:** the tree no longer uses classes. A student is placed on a **section**, not a class.
- **Nesting:** the tree can now nest to any depth. The **+** on any row adds a sub-item inside it.
- **Placement:** students can only be placed on the **last item of a branch**, never on an item
  that has sub-items.
- **Filtering:** clicking any item in the tree shows all students under it.
- **Renaming** an item updates the المرحلة / الصف text of every student under it.
- **Deleting** an item deletes everything inside it. Its students are kept, but without a placement.
- **Rearranging (optional):** the **⇅** button in the الهيكل header turns on drag mode (press it again
  to turn it off). While it is on, every row shows a grip and can be dragged:
  - A **stage** dropped on the top or bottom half of another stage goes before or after it.
  - A **level** dropped on the top or bottom edge of another level goes before or after it. Dropped on
    the middle of a level, it moves inside it. Dropped on a stage, it moves to the end of that stage.
  - A level moves with everything inside it, including to another stage. The المرحلة / الصف text of
    its students is updated.
  - A level can't be moved inside itself, or inside a level that has students placed on it.
  - Only users who manage every stage can reorder stages.

### المرحلة الثانوية

Built from the Ministry charts (* = where students can be placed):

```
المرحلة الثانوية
├ الصف الأول الثانوي *
├ الصف الثاني الثانوي
│  ├ البكالوريا المصرية → الطب وعلوم الحياة* · الهندسة وعلوم الحاسب* · الأعمال* · الآداب والفنون*
│  └ الثانوية العامة (نظام جديد) → شعبة علمي* · شعبة أدبي*
└ الصف الثالث الثانوي
   ├ البكالوريا المصرية → الطب* · الهندسة* · الأعمال* · الآداب والفنون*
   └ الثانوية العامة (نظام جديد) → شعبة علمي* · شعبة الرياضيات* · شعبة أدبي*
```

- Each track's subjects from the charts were created and linked to it.
- الصف الأول الثانوي is not in the charts, so it was added without tracks.
- The tree was added once. Later edits to it are kept and not overwritten.

---

## 4. Subjects (المواد)

Subjects are managed in **المواد** on the Students ribbon. Each subject is linked to the sections
that study it, and **each section has its own settings**:

- **النهاية الكبرى / النهاية الصغرى** (full marks / pass mark). These differ by grade year, so
  they are set per section.
  - Typing a صغرى fills in كبرى as double it. كبرى can still be typed by hand.
  - A **"نفس القيم لكل المحدد"** row copies one pair of marks to every ticked section.
- **Choosing sections:** the list is grouped by stage. Each stage, and each level that has
  sub-levels, has its own checkbox: ticking it selects every section under it (ticking again clears
  them), and it shows how many are ticked (e.g. `3/6`).
- Pressing **edit** on a subject scrolls back up to the form, with the section list scrolled to the
  subject's first section.
- **خارج المجموع** (outside the total): the degree is entered and printed, but left out of
  مجموع الدرجات and the percentage.
  - It is set per section. For example, اللغة الأجنبية الثانية is خارج المجموع in الثانوية العامة,
    but is a specialised subject in بكالوريا الآداب.
- **اختياري** (choose one): in الصف الثاني بكالوريا the specialised pairs, such as
  الرياضيات أو الفيزياء, are choose-one. Totals count only the subject the student has a degree in.

The marks can only be changed in المواد. They are read-only on the student's record.

**Import / Export (المواد header):** one row per subject and section: المادة, المرحلة, الصف (the
section's full path, as exported), النهاية الكبرى, النهاية الصغرى, خارج المجموع (نعم / لا).

- **تصدير** saves every subject that way; a subject with no section is one row without one.
- **استيراد:** a new subject name is added. An existing subject gets the row's section linked, or
  that section's marks updated; its other sections are kept. Empty marks keep what the section had;
  a صغرى alone makes the كبرى double it.
- المرحلة can be left out when the الصف path is in only one stage. A الصف that isn't the last item
  of a branch, or isn't found, rejects the row.

---

## 5. Degrees (الدرجات)

### Per student

On the student's **ملف الدرجات** tab, or by clicking a student's row in the Degrees Profile screen:

- Each subject shows the section's **النهايات** (كبرى / صغرى, read-only) and **one degree** box
  (الدرجة), out of the كبرى mark. (The earlier separate صغرى degree is no longer entered or shown.)
- A degree higher than the كبرى mark is shown in red and is refused on save.
- Totals: **مجموع الدرجات**, **النسبة المئوية** and **الحالة**.
- **طباعة الشهادة** opens the certificate print preview (see below).

### Percentage

```
النسبة المئوية = (مجموع الدرجات ÷ مجموع النهايات الكبرى) × 100
```

- Both sums leave out subjects that are **خارج المجموع**. In a choose-one (اختياري) pair only one
  subject's mark counts.
- The denominator is the كبرى marks of **all** the student's subjects in the total, including ones
  with no degree yet, so a student with missing degrees shows a lower percentage.
- It is rounded to one decimal, and is empty until at least one degree is entered.

### الحالة

| النسبة المئوية | الحالة |
|---|---|
| 50% or more | **ناجح و منقول للصف التالي** (green) |
| below 50% | **راسب** (red) |
| no degree yet | (empty) |

الحالة is a column in the Students table (filter it from the column header), in Export and in
the Students print, and is shown in ملف الدرجات and on certificates.

A placed student whose section has no subjects in المواد (e.g. رياض اطفال) shows only the subjects
they already have a degree in, instead of every subject. A student with no placement still gets
every subject.

### Marks are frozen on saved degrees

When a degree is saved, the section's marks at that moment are stored with it. Changing a
section's marks later does **not** change degrees already saved, or their printed certificates.
Changing the degree itself picks up the section's current marks.

### Degrees Profile screen (ملف الدرجات on the ribbon)

- One table of all students, with name, الرقم القومي, كود الحكومة الالكترونية, المرحلة and الصف.
- Each subject has **one column**: the student's degree. Under the subject's name: its marks as
  **صغرى / كبرى** (e.g. `50 / 100`), when they are the same for every section shown.
- **Column order:** subjects in the total, then **مجموع الدرجات**, then subjects **خارج المجموع**,
  then **%** and **الحالة**. Under مجموع الدرجات: the total marks as صغرى / كبرى (e.g. `240 / 480`),
  when they are the same for every student shown.
- A subject marked خارج المجموع in a section is not added to مجموع الدرجات or the percentage.
- **Filters:**
  - **المراحل:** a whole stage, or any item in the tree with everything under it. It starts on what's
    selected in the الهيكل tree.
  - **Subject columns:** only the subjects linked in **المواد** to the sections of the students shown
    (after all filters). A stage whose students are all in one track shows only that track's
    subjects, which keeps the printout narrow. With no placed student shown, the subjects of the
    chosen part of the tree.
  - **الحالة:** ناجح، راسب، or بدون درجات.
  - **Search** by name, national ID, كود الحكومة الالكترونية, division, section or school.
- **الأعمدة** (top bar): tick which columns show: student data, **المواد**, مجموع الدرجات, النسبة
  المئوية and الحالة. **المواد** is one checkbox for all the subject columns: ticked, the table shows
  the subjects of the students shown (see Subject columns above). The rest of البيانات الأساسية
  (النوع, الديانة, نوع القيد, الجنسية, تاريخ الميلاد, السن في ١ أكتوبر, المدرسة) can be ticked too;
  they are off until ticked. The choice is remembered in this browser; **استعادة الافتراضي** puts
  the defaults back.
- **تصدير** saves the table as shown (rows after filters, the columns ticked in الأعمدة, in their
  order) to Excel.
- **استيراد** reads Excel or CSV: one row per student, with الرقم القومي, كود الحكومة الالكترونية
  or الاسم, and one column per subject named as the subject. An exported file can be imported back
  as it is (its totals columns are ignored).
  - Students are found by الرقم القومي, then كود الحكومة الالكترونية, then the name if only one
    student has it.
  - Empty cells (or "—") leave the degree as it is. Arabic digits (٤٥) are read.
  - A degree above the subject's النهاية الكبرى rejects the row. A subject not linked to the
    student's section is skipped, with a warning.
  - Only the import's subjects are saved; the student's other degrees stay.
- **Click a row** to edit that student's degrees.
- **Printing:**
  - **طباعة الكل** prints the table rows currently shown (all filters apply), starting from the
    table's columns in their current order (الأعمدة and any dragged headers). The preview works like
    the Students print: title, columns (student data, each subject, totals) that can be hidden or
    moved, portrait/landscape, font size, and removing single rows.
  - **Checkboxes** select students. **طباعة الشهادات (n)** prints a certificate for each ticked
    student in the current view. The print icon on a row prints that student's certificate.

### Certificate (بيان نجاح طالب)

**Official forms.** Students of these stages are printed on the education administration's own
form, laid out as the paper one:

| Stage | Form | Layout |
|---|---|---|
| المرحلة الإعدادية (every grade) | كشف درجات طالب إعدادي (portrait) | Subjects run down: البيان, الدرجة الكلية (نهاية كبرى / صغرى), درجة الطالب, ملاحظات; المجموع after the subjects in the total |
| الصف الأول الثانوي | اخطار بنتيجة الصف الأول الثانوي (landscape) | Subjects across, rows النهاية الكبرى / الصغرى / الدرجة; المجموع shaded before the subjects خارج المجموع |
| الصف الثاني الثانوي → الثانوية العامة → شعبة علمي / أدبي | اخطار بنتيجة الصف الثاني الثانوي (علمي / أدبي) | As above |

- Subjects are in the paper form's order. The forms' subjects were added to **المواد** and linked to
  their sections with the forms' marks (see §8). A section whose marks were already set keeps them.
- **The form's texts are student data:** البيانات الأساسية → **بيانات بيان النجاح** holds المحافظة,
  المديرية, الإدارة التعليمية, القسم (الثانوي / الإعدادي), عنوان الإعدادي, الدور, العام, لتقديمه إلى,
  الرسوم (ق / ج), رقم الحوالة, بتاريخ and تحريرا في for each student.
- **بيانات النموذج** in the preview has a checkbox per field (only those of the forms being printed):
  ticked, the student's text is printed, or the form's default when the student has none (the open
  year, the school's administration, التحكم's المديرية, the forms' own titles); unticked, an empty
  line to fill by hand. The choice is remembered in this browser.
- Any text (also رقم الجلوس, اللغة الثانية, نتيجة الطالب) can still be typed straight on a sheet, for
  that printout only.
- **Signatures** as on the paper: secondary رئيس القسم · مدير شئون الطلبة · يعتمد مدير الإدارة; prep
  المراجع · رئيس القسم · مدير شئون الطلبة · مدير عام الإدارة. Each form's captions can be edited.
- **النموذج الرسمي لكل مرحلة** (on by default) can be turned off to print everyone on the app's
  certificate below. Other stages (رياض أطفال, الابتدائية, الصف الثالث الثانوي, البكالوريا) always use it.

**The app's certificate:**

- **Header:** on the right, **مديرية التربية و التعليم** and **إدارة …**: the الإدارة set for the
  student's school in **إضافة مدرسة** (shown once if its name already starts with "إدارة" or "ادارة"). Title in
  the middle, the logo on the left. **تاريخ الطباعة** is on the left of the page, under the header.
- **Student details:** on the right الاسم, الرقم القومى and العام الدراسي (from Preferences); on the
  left المدرسة, المرحلة and الصف. كود الحكومة الالكترونية is hidden by default and can be turned on in
  the preview options.
- **Horizontal table:** one column per subject, with **المجموع** after the subjects in the total
  and before the subjects خارج المجموع (which are marked). Rows: النهاية الكبرى, النهاية الصغرى,
  الدرجة.
- Under it: النسبة المئوية and الحالة (green / red).
- **Preview options:** title; which of the selected students to print; show or hide the
  النهاية الكبرى / الصغرى rows, percentage, status and print date; signatures; portrait/landscape;
  font size; one certificate per page or one after another.

### Signatures (all print previews)

The Students print, the ملف الدرجات table print and the certificate all have a **التوقيعات**
section. The captions (default **شئون الطلاب** and **مدير الإدارة**) can be edited, removed, or
added to (up to 4). They are remembered in this browser for the next printout; **الافتراضي** puts
the two defaults back. The defaults can be changed in **التحكم**.

**الختم (stamp):** every printout with signatures has an empty, labelled place for the stamp under
**مدير الإدارة** (or the last signature). Drag it in the preview to move it; the dashed outline is
only shown in the preview. Its position is remembered in this browser; **مكانه الأصلي** puts it
back, and it can be turned off under التوقيعات. A caption saved as
"مدير المدرسة" before the rename now shows as "مدير الإدارة". Signatures are on by default for certificates and off for the two tables.

---

## 6. Users (المستخدمين)

### Sub-tabs

| Tab | Contents |
|---|---|
| المستخدمين | Users list |
| النشاط | Activity |
| **مدينة** | Cities: postal code, name, comment |
| **إدارة تعليمية** | Education administrations: code, name, comment |

### New user / Edit user

Both use the same form:

| Field | How it's set |
|---|---|
| مدينة, إدارة تعليمية | Dropdowns from the two tabs above |
| الكود | Random, unique, 5 digits (can be regenerated) |
| اسم المستخدم | Generated as `الاسم الأول_مدينة_الكود`; the first name is the first word of الاسم بالكامل, so the username changes when the name, city or code changes |
| كلمة المرور المؤقتة | Generated as `الدور_الكود` (e.g. `teacher_48213`), shown once after saving |

- **Edit** can reset the password back to the temporary one.

### إدارة الصلاحيات

Opened with the lock icon on a user's row (admins and the master account only).

- **Modules:** only the parts the app currently shows are offered: **الطلاب** (students, import,
  export, print, subjects, degrees), **المستخدمين**, **العام الدراسي**, **الإعدادات** and **التحكم**. Grants for hidden modules are
  kept as they are, so turning the extended features back on loses nothing.
- **المراحل:** **كل المراحل** (the default), or tick the stages the user manages. A user limited to
  some stages:
  - sees only those stages in the tree and only their students, in the table, Degrees Profile,
    Print and Export;
  - can add, edit, delete and grade only students placed in those stages, and can't move a
    student out of them. Students with no placement are outside their stages;
  - can't add a new stage or edit another stage's part of the tree;
  - in المواد, sees and edits only their stages' sections of a subject. They can't rename or
    delete a subject that other stages also use.
- Admins always have every module and every stage.
- **First sign-in:** a new user, or one whose password was reset, must choose their own password
  before getting in. These users are marked "في انتظار أول دخول" in the list.

### Sign-in rules

- Signing in happens on a dedicated page. Logging out returns there, and reloading the page does
  not sign you back in.
- **Lockout:** after **5 wrong passwords in a row** for the same username, that username is
  locked for **5 minutes**. During the lock even the correct password is refused.
- The page warns how many attempts are left, shows a countdown while locked, warns when
  Caps Lock is on, can show or hide the password, and has **تذكرني** (remembers the username only).
- The top-right menu shows the user's name, username and role, with تغيير كلمة المرور and تسجيل الخروج.

---

## 7. Control (التحكم)

The **التحكم** tab sits next to **الإعدادات**. Changes are a draft until **حفظ**; **الافتراضي**
clears everything back to the app's own names and removes added tabs (after a confirmation, and
still only on حفظ). Who can open it: admins, the master account, and users given **التحكم** in
إدارة الصلاحيات.

**التبويبات** (one row per tab, grouped by section):

| Control | What it does |
|---|---|
| Name box | The tab's name everywhere it's shown. Empty = its own name |
| **يتبع** | Links the tab to another tab of its section: it sits right after that tab (marked ↵), is hidden whenever that tab is hidden, and an added tab lists it under "تبويبات مرتبطة" |
| **ظاهر / مخفي** | A hidden tab disappears from the tab row for other users, and opening its address takes them to the first tab they can open. Whoever manages التحكم still sees it, marked with a crossed-out eye, so they can't lock themselves out |
| ⌄ / 🗑 (added tabs) | Edit an added tab's name, section and text; delete it |

- **تبويب جديد** adds a tab (name + section). An added tab is a page with its title and free text.
- **المستخدمين** (opened from the Students ribbon) is listed too: renaming or hiding it changes that
  ribbon button.
- Built-in tabs can be hidden but not deleted. The modules switched off with
  `SHOW_EXTENDED_FEATURES` (Finance, HR, …) are not offered.
- Hiding a tab only hides it in the app. It doesn't change anyone's permissions (إدارة الصلاحيات).

**Texts** (empty = the default shown in grey):

- **الأقسام الرئيسية:** شئون الطلاب, شئون العاملين.
- **أزرار شريط الطلاب:** the group caption and each button. Each button also has **ظاهر / مخفي**: a
  hidden button is gone for every user. The المستخدمين button is hidden with its tab, above.
- **نصوص الطباعة (PDF):** the certificate title, its header lines (مديرية التربية و التعليم, the word
  before the administration's name), the default titles of the Students and Degrees prints, the
  "تاريخ الطباعة" label, and the two default signatures.

---

## 8. Data changes

All changes are additive and run automatically when the server starts. No existing data was removed,
except the two clean-ups noted at the end of this section.

| Area | Change |
|---|---|
| Students | New: المدرسة, التسكين (section link, filled in from each student's old class), الديانة uses the existing field |
| Hierarchy | Sections can nest. المرحلة الثانوية tree added once |
| Subjects | كبرى/صغرى, خارج المجموع and اختياري are stored per section. The old subject-wide marks were copied to each of the subject's sections |
| Degrees | New per-student degrees table: كبرى degree, صغرى degree, and the frozen marks |
| Users | New: code, city, education administration, "must change password". New cities and education-administrations tables. New sign-in lockout table |
| Users — stages | New `users.stages_restricted` flag and `user_stages` table (the stages a limited user manages) |
| Students — نوع القيد | New `students.enrollment_type` (مستجد / غير مستجد) |
| Students — الجنسية | Uses the existing `students.nationality` column |
| Settings — التحكم | New `ui_control` setting (JSON): hidden / renamed tabs, يتبع links, added tabs, texts, hidden ribbon buttons |
| Academic years | New `academic_years` table (name, archived) and `students.academic_year_id`. The first year is made from Preferences' العام الدراسي and every existing student is put in it. The open year is the `current_academic_year_id` setting; `academic_year` follows its name |
| Students — بيانات بيان النجاح | New `students.form_fields` (JSON of the official form's texts) |
| Subjects — official forms | Added once (flag `synced_certificate_subjects_v1`): التربية الرياضية, المستوى الرفيع, العلوم المتكاملة, الفلسفة والمنطق, التربية المهنية, and the forms' links and marks for الإعدادية, الصف الأول الثانوي and الصف الثاني (علمي / أدبي). Links that already had marks were not changed |
| Degrees | One degree per subject (`student_grades.score`). `score_min` is kept in the table but no longer entered; it is cleared when a student's degrees are saved again |

Clean-ups:

- Per-student mark overrides from an intermediate version, on rows with no degree, were removed.
- Saved table-column choices were reset once, so the new default columns show.

---

## 9. Open items and decisions

1. **70% pass mark** for التربية الدينية: the charts set its pass mark at 70%, but the
   كبرى = صغرى × 2 rule assumes 50%. A per-subject pass-percentage setting would solve this.
2. **Duplicate subjects:** the older English-named subjects ("Arabic", "math") are separate from
   the new "اللغة العربية" and "الرياضيات". Decide whether to merge or rename them.
3. **Choose-one groups** can't yet be created or edited in the screens. Only the seeded
   بكالوريا pairs exist.
4. **Server messages** (e.g. "Username already taken") are still in English.
5. **Missing gender on import** is still saved as غير محدد. Decide whether to default it or
   reject the row.
6. **Lockout is per username**, so anyone who knows a username can lock it for 5 minutes,
   including the master account.
7. **Not built yet** from the Users spec: role management screen, password policy screen,
   email (SMTP), account-recovery requests, demo accounts.
8. **Master account** still uses its default password (`change-me` in
   `server/master-account.json`). Change it before going live.

---

## 10. How it was checked

- The server rules were tested end to end against **copies** of the real database, never the live
  one. This covered:
  - Placement, the Hierarchy tree and the secondary seed.
  - Marks per section, خارج المجموع, choose-one, and frozen marks.
  - Degrees, totals and percentage.
  - Users: generated credentials, first sign-in, and lockout on the 6th attempt with the correct
    password.
- The main screens were checked in a headless browser:
  - Sign-in, Students, the student form, Degrees Profile and its editor, Users.
  - The Hierarchy tree and Subject Setup.
- The client typechecks and builds cleanly.

---

## 11. Technical reference (for developers)

**Feature switch:** `client/src/lib/features.ts`

- `SHOW_EXTENDED_FEATURES` hides or shows everything outside the core.
- `CORE_MODULE_KEYS` lists the module tabs kept visible.

**Server**

| File | Purpose |
|---|---|
| `server/src/db.ts` | Migrations: `migrateSubjectsColumns`, `migrateUsersColumns`, `migrateLevelsColumns`; `seedSecondaryTree` (runs once, guarded by the settings flag `seeded_secondary_tree_v1`) |
| `server/src/routes/classes.ts` | Nested tree response (flat list with `parent_id`, `depth`, `path`, `is_leaf`); `syncStudentPositionText`; deleting a branch; drag moves (`PUT /stages/:id/position`, `PUT /levels/:id/position`) |
| `server/src/routes/students.ts` | Position must be a leaf; `studentGrades`; `/degrees-overview`; saving grades with frozen marks; `degreeSummary` (totals and percentage, same rule as the client); stage scope checks |
| `server/src/routes/subjects.ts` | Per-section `levelMarks` (كبرى/صغرى, `outsideTotal`). `elective_group` is preserved. Open to the `timetable` **or** `students` permission |
| `server/src/routes/users.ts` | Generated code, username and password; edit with optional reset; `must_change_password` |
| `server/src/routes/userCatalogs.ts` | Cities and education administrations CRUD; reading is also open to the `students` permission |
| `server/src/routes/schools.ts` | Schools (shared with HR); `city_id` / `education_admin_id` (`migrateSchoolsColumns`); renaming updates `students.school`. Open to `students` too |
| `server/src/routes/auth.ts` | Lockout (5 tries, 5 minutes); first-login password change through `/auth/reset-password` |
| `server/src/permissions.ts` | `requireModule(...)` accepts several modules (any one is enough); `getStageScope` (stages a user may manage, `null` = all) |
| `server/src/routes/settings.ts` | `PUT /settings/ui-control` (needs `controlPanel`) saves the التحكم configuration; the Preferences save ignores `ui_control` |
| `server/src/academicYears.ts`, `server/src/routes/academicYears.ts` | The open year (`currentAcademicYearId`); list, add, rename, open, archive, delete. Students' list and `/degrees-overview` only return the open year |
| `server/src/db.ts` | Also `migrateAcademicYears`, `migrateAcademicYearTab`, `syncCertificateSubjects` |
| `server/src/routes/permissions.ts` | Modules and `stageIds` (`null` = every stage) per user |

**Client**

| File | Purpose |
|---|---|
| `client/src/components/StudentFormModal.tsx` | Core fields, التسكين, الديانة, المدرسة dropdown |
| `client/src/components/SchoolFormModal.tsx` | إضافة مدرسة |
| `client/src/components/StudentDegreesEditor.tsx` | Shared per-student degrees editor |
| `client/src/components/DegreesProfileModal.tsx` | Degrees Profile screen |
| `client/src/components/StudentCertificateModal.tsx` | Certificate print preview: the official forms (`SecondaryForm`, `PrepForm`, editable `Field`s) and the app's certificate |
| `client/src/lib/certificateForms.ts` | Which form a student gets (`certificateFormFor`), the forms' subject order and signatures |
| `client/src/pages/AcademicYearsPage.tsx` | العام الدراسي cards |
| `client/src/components/StudentsTable.tsx` | Students table; 50-per-page paging (`PAGE_SIZE`), reset by the page's `pageResetKey` |
| `client/src/components/StudentsPrintModal.tsx` | Students print preview (divisions, columns, layout); print CSS in `index.css` (`.print-modal-root`, `.print-sheet`) |
| `client/src/lib/degrees.ts` | `degreeTotals` (outside-total and choose-one rules, percentage), `passStatus` (ناجح / راسب), `autoMaxFromMin` (×2 rule for marks), print helper |
| `client/src/components/PrintParts.tsx` | Shared print-preview pieces (modal, logo/date header, layout options, column and row controls, signatures and the draggable `StampBox`) used by the Students print, the Degrees table print and certificates |
| `client/src/components/DegreesTablePrintModal.tsx` | ملف الدرجات → طباعة الكل |
| `client/src/lib/uiControl.ts` | التحكم configuration: `useUiControl()` (`t(key)` texts, `tabLabel`, `isTabVisible`), `TEXTS` (every editable text and its default), `buildTabs`, `orderWithChildren` |
| `client/src/pages/ControlPage.tsx`, `CustomTabPage.tsx`, `components/HiddenTab.tsx` | التحكم screen; an added tab's page (`/custom/:key`); redirect away from a hidden tab |
| `client/src/lib/studentAge.ts` | Age on 1 October |
| `client/src/lib/useColumnOrder.ts` | Drag-to-reorder table columns (`useColumnOrder`, `orderedCells`); saved in `localStorage` as `column_order:<table>`; drag styles in `index.css` |
| `client/src/components/ClassTree.tsx` | Nested tree; drag mode (`ArrangeContext`, `useArrangeRow`) |
| `client/src/context/ClassesContext.tsx` | Selection by `levelId`, `levelAndDescendants`, `positionOptions` |
| `client/src/components/timetable/SubjectSetupModal.tsx` | Per-section marks, خارج, اختياري badge |
| `client/src/pages/UsersPage.tsx`, `SystemUserModal.tsx`, `UserCatalogTab.tsx` | Users, credential generation, city and administration tabs |
| `client/src/pages/LoginPage.tsx`, `LoginChangePasswordModal.tsx` | Lockout display, first-login change |

**Right-to-left:** `client/index.html` sets `lang="ar" dir="rtl"`. Directional Tailwind classes
were converted to logical ones (`ms-`/`pe-`/`start-`/`text-start`, and so on). The print views that
were already right-to-left keep their physical classes.
