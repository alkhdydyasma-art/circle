# نشر سيركل داخل السعودية (Oracle Cloud – الرياض)

كل شيء يعمل على سيرفر واحد في منطقة الرياض: الموقع ولوحات التحكم، وقاعدة البيانات
(Supabase مستضافة ذاتياً)، وn8n للأتمتة، وCaddy لشهادات HTTPS. بيانات المرضى لا تخرج من
المملكة، والنسخ الاحتياطية مشفّرة وتُحفظ في تخزين أوراكل في الرياض أيضاً.

```
الإنترنت ──443──▶ Caddy ─┬─▶ app (سيركل)  ──▶ Supabase (Auth + REST + Postgres)
                          └─▶ n8n (الأتمتة)
Studio (لوحة قاعدة البيانات): على السيرفر فقط 127.0.0.1:8000 — تفتحها عبر نفق SSH
```

| الملف | وظيفته |
| --- | --- |
| `install.sh` | التثبيت لأول مرة (آمن لو أعدت تشغيله) |
| `deploy.sh` | نشر آخر تحديث من GitHub: نسخة احتياطية ← سحب ← بناء ← ترحيلات ← تشغيل |
| `backup.sh` | نسخة احتياطية مشفّرة (تلقائياً كل يوم 3:30 فجراً بتوقيت الرياض) |
| `restore.sh` | استرجاع نسخة احتياطية |
| `healthcheck.sh` | فحص كل 5 دقائق وتنبيه عند العطل وعند التعافي |
| `create-admin.sh` | إضافة حساب موظف سيركل (مشرف) |
| `logs.sh` | حالة الخدمات وآخر السجلات |
| `migrate.sh` | تطبيق ترحيلات قاعدة البيانات الجديدة (يستدعيه `deploy.sh`) |

**التكلفة:** السيرفر (Ampere A1 حتى 4 معالجات و24 جيجا ذاكرة)، والقرص (حتى 200 جيجا)، والتخزين
(20 جيجا) كلها ضمن الطبقة المجانية الدائمة لأوراكل. الباقي هو الدومين ومزوّد الإيميل (له خطة مجانية).

---

## الخطوة 1: حساب أوراكل

1. سجّل في <https://www.oracle.com/cloud/free/>.
2. **Home Region: اختر `Saudi Arabia Central (Riyadh)`.** لا يمكن تغييرها لاحقاً، والموارد
   المجانية متاحة في منطقة البداية فقط.
3. يطلب بطاقة للتحقق فقط. بعد التفعيل أنصح بالترقية إلى **Pay As You Go**: يبقى المجاني مجانياً،
   لكن أوراكل لا توقف السيرفر إذا كان خاملاً، وتتوفر سعة أكثر. أضف **Budget** بحد 50 ريال مع تنبيه.

## الخطوة 2: السيرفر

1. Compute ← Instances ← **Create instance**.
2. **Image:** Canonical Ubuntu 24.04.
3. **Shape:** Ampere ← `VM.Standard.A1.Flex` ← 2 OCPU و12 GB (أو 4 و24).
   - إذا ظهرت رسالة *Out of capacity* جرّب لاحقاً. البديل المدفوع `VM.Standard.E5.Flex` بمعالج واحد
     و8 جيجا، وتحقق من سعره في حاسبة أوراكل قبل الاختيار.
4. **Networking:** شبكة جديدة مع *Assign a public IPv4 address*.
5. **SSH keys:** اضغط *Generate a key pair* ونزّل المفتاح الخاص. **احتفظ به، ولا تعطه لأحد.**
6. **Boot volume:** 100 GB.
7. بعد الإنشاء اجعل الـ IP ثابتاً: Networking ← Reserved public IPs، أو من صفحة الـ VNIC غيّر الـ IP
   إلى Reserved.

## الخطوة 3: فتح المنافذ

- Networking ← Virtual cloud networks ← شبكتك ← Security Lists ← Default ← **Add Ingress Rules**:
  - Source `0.0.0.0/0` ← TCP ← المنفذ `80,443`.
  - Source `0.0.0.0/0` ← UDP ← المنفذ `443`.
- اترك منفذ SSH 22 كما هو. الأفضل أن تجعل مصدره عنوان الـ IP الخاص بك فقط.
- **لا تفتح** أي منفذ آخر (5432 أو 8000 وغيرها).

## الخطوة 4: الدومين

في لوحة مزوّد الدومين أضف ثلاثة سجلات **A** كلها تشير إلى IP السيرفر:

| الاسم | القيمة |
| --- | --- |
| `@` | IP السيرفر |
| `www` | IP السيرفر |
| `n8n` | IP السيرفر |

## الخطوة 5: مكان النسخ الاحتياطية (في الرياض)

1. Storage ← Buckets ← **Create bucket**، الاسم `circle-backups`، النوع Standard.
   اتركه **Private**، ولا تفعّل الوصول العام.
2. من صفحة الـ bucket انسخ **Namespace**. الـ Endpoint يكون:
   `https://<namespace>.compat.objectstorage.me-riyadh-1.oraclecloud.com`
3. من الصورة الشخصية ← My profile ← **Customer secret keys** ← Generate.
   انسخ الـ *Secret* فوراً لأنه يظهر مرة واحدة، وانسخ الـ *Access key*.

## الخطوة 6: الإيميل (لروابط استعادة كلمة المرور)

أنشئ حساباً عند مزوّد SMTP مثل Brevo أو Zoho أو Resend، ووثّق دومينك عنده، ثم خذ بيانات SMTP:
المضيف والمنفذ 587 والمستخدم وكلمة المرور.

الرسائل تحتوي فقط على رابط استعادة كلمة المرور لموظفي العيادة، ولا تحتوي بيانات مرضى.

## الخطوة 7: التثبيت

من جهازك ادخل على السيرفر:

```bash
ssh -i مسار-المفتاح ubuntu@IP-السيرفر
```

ثم على السيرفر:

```bash
sudo apt-get update && sudo apt-get install -y git
sudo git clone https://github.com/alkhdydyasma-art/circle.git /opt/circle/app
sudo cp /opt/circle/app/deploy/circle.conf.example /opt/circle/circle.conf
sudo nano /opt/circle/circle.conf      # عبّئ الدومين والإيميل وSMTP والنسخ الاحتياطية، ثم Ctrl+O ثم Ctrl+X
sudo bash /opt/circle/app/deploy/install.sh
```

- يأخذ التثبيت بين 10 و20 دقيقة.
- **إذا كان المستودع خاصاً:** أنشئ مفتاحاً على السيرفر بالأمر
  `sudo ssh-keygen -t ed25519 -f /root/.ssh/id_ed25519 -N ""`.
  أضف محتوى `/root/.ssh/id_ed25519.pub` في GitHub ← المستودع ← Settings ← Deploy keys (قراءة فقط).
  بعدها استخدم `git@github.com:alkhdydyasma-art/circle.git` بدل رابط https، في أمر النسخ وفي `REPO_URL`.

**في نهاية التثبيت يطبع لك شيئين. احفظهما فوراً في مدير كلمات المرور:**

1. **كلمة مرور حساب المشرف** (`ADMIN_EMAIL`).
2. **مفتاح فك النسخ الاحتياطية** (`AGE-SECRET-KEY-…`). بدونه لا يمكن استرجاع النسخ لو ضاع السيرفر.

## الخطوة 8: بعد التثبيت مباشرة

1. **n8n:** افتح `https://n8n.<دومينك>` فوراً وأنشئ حساب المالك. أول من يفتح الصفحة يصبح المالك.
2. **سيركل:** افتح `https://<دومينك>/ar/login` وادخل بحساب المشرف، ثم غيّر كلمة المرور من
   `https://<دومينك>/ar/reset-password`.
3. **مراقبة خارجية (مجانية):** أنشئ حساباً في UptimeRobot أو Better Stack، وأضف مراقبة على
   `https://<دومينك>/api/health`. هذه تنبّهك لو توقف السيرفر كله.
4. **تنبيهات السيرفر (اختياري):** ضع في `ALERT_WEBHOOK_URL` رابط webhook في n8n يحوّل الرسالة
   إلى واتسابك، ثم أعد تشغيل `install.sh`.
5. **ربط واتساب:** اتبع [`n8n/README.md`](../n8n/README.md).

---

## العمليات اليومية

| المطلوب | الأمر (على السيرفر) |
| --- | --- |
| نشر آخر تحديث | `sudo bash /opt/circle/app/deploy/deploy.sh` |
| حالة الخدمات | `sudo bash /opt/circle/app/deploy/logs.sh` |
| سجلات خدمة | `sudo bash /opt/circle/app/deploy/logs.sh app` (أو `n8n` أو `auth` أو `caddy` أو `db`) |
| نسخة احتياطية الآن | `sudo bash /opt/circle/app/deploy/backup.sh` |
| إضافة مشرف | `sudo bash /opt/circle/app/deploy/create-admin.sh email@example.com` |
| كلمات مرور Studio | `sudo bash /opt/circle/supabase/run.sh secrets` |

**فتح Studio (لوحة قاعدة البيانات):** من جهازك شغّل
`ssh -i المفتاح -L 8000:127.0.0.1:8000 ubuntu@IP`، ثم افتح <http://localhost:8000>.
لا تعدّل الجداول يدوياً إلا للضرورة، فكل تغيير في البنية يكون عبر ملفات الترحيل في `supabase/migrations`.

**تغيير الإعدادات:** عدّل `/opt/circle/circle.conf` ثم أعد تشغيل `install.sh`، وهو لا يغيّر الأسرار المولّدة.
الإعدادات المتقدمة، مثل روابط n8n وقيمة `WHATSAPP_PHONE_NUMBER_ID`، موجودة في
`/opt/circle/supabase/.env`. بعد تعديله شغّل `deploy.sh`.

## الاسترجاع

**على نفس السيرفر** (لو حُذفت بيانات بالخطأ مثلاً):

```bash
ls /opt/circle/backups
sudo bash /opt/circle/app/deploy/restore.sh /opt/circle/backups/circle-YYYYMMDD-HHMMSS.tar.age
```

**لو ضاع السيرفر بالكامل:**

1. أنشئ سيرفراً جديداً بنفس الخطوات من 2 إلى 4.
2. أنشئ المجلد `/opt/circle`، ثم احفظ **مفتاح النسخ الاحتياطية القديم** في الملف
   `/opt/circle/backup-key.txt` قبل التثبيت، وأعطه الصلاحية `chmod 600`.
3. ركّب `circle.conf` وشغّل `install.sh`.
4. نزّل آخر نسخة من الـ bucket (Oracle console ← Buckets ← `circle-backups/daily`) إلى السيرفر،
   ثم شغّل `restore.sh` عليها.

`restore.sh` يسترجع:
- الحسابات بكلمات مرورها.
- العيادات والمرضى والمواعيد.
- إعدادات n8n وبيانات الربط، مثل مفاتيح واتساب.
- الملفات المرفوعة.

## الأمان باختصار

- المنفذان 80 و443 فقط مفتوحان للإنترنت. قاعدة البيانات وStudio لا يمكن الوصول لهما من الخارج.
- كل الأسرار مولّدة عشوائياً أثناء التثبيت ومحفوظة بصلاحية root فقط في `/opt/circle`.
- التسجيل الذاتي مقفل، والحسابات تُنشأ بدعوة فقط.
- السيرفر يثبّت تحديثات الأمان تلقائياً (unattended-upgrades)، وfail2ban يحمي SSH.
- سجلات تنفيذ n8n (فيها أسماء وأرقام المرضى) تُحذف بعد 14 يوماً.
- النسخ الاحتياطية مشفّرة بـ age قبل خروجها من السيرفر، وتُحفظ 7 أيام على السيرفر و35 يوماً في الـ bucket.
