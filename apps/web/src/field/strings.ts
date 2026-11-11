export const fieldStrings = {
  en: {
    title: "Field workspace",
    subtitle: "Capture the face. Keep the context.",
    home: "Operations workspace",
    language: "العربية",
    theme: "Switch theme",
    signout: "Sign out / lock device",
    online: "Online",
    offline: "Offline device copy",
    loading: "Opening your field workspace…",
    signin: "Sign in to open your downloaded assignments.",
    workerOnly: "A worker account is required for field capture.",
    download: "Download assignments",
    downloaded: "Downloaded for this device",
    downloadFirst:
      "Open a visit to capture live photos. Download assignments for offline work.",
    tasks: "My visits",
    empty: "No assignments available.",
    open: "Open inspection",
    back: "Back to visits",
    locked: "Locked face identity",
    original: "Registered billboard location",
    unverified: "Unverified coordinates",
    uncertainty: "uncertainty",
    structure: "Structure / face",
    due: "Due",
    start: "Start inspection",
    local: "Saved on this device",
    queued: "Queued — no server receipt",
    uploading: "Uploading — not submitted",
    blocked: "Needs attention — originals retained",
    received: "Server received — awaiting human review",
    receipt: "Server receipt",
    deviceTime: "Device-claimed capture time",
    receivedTime: "Server-received time",
    front: "Front photograph",
    wide: "Wide context photograph",
    frontGuide:
      "Show the entire billboard face, edges and readable code where present.",
    wideGuide:
      "Show the structure, supports, nearby road and surroundings. Stop only where safe.",
    camera: "Start live camera",
    stop: "Stop camera",
    capture: "Capture",
    cameraDenied:
      "Camera permission denied. Allow camera access in browser settings and try again.",
    cameraMissing:
      "Camera unavailable. Use a supported browser over HTTPS and check your device.",
    cameraReady: "Wait for the live camera image before capture.",
    gps: "Record location fix",
    gpsBusy: "Getting a fresh GPS observation…",
    gpsNone:
      "Location is requested automatically for each photo. Missing GPS keeps the photo as a draft until retaken or a supervisor exception is authorized.",
    gpsDenied:
      "Location permission denied. Photos stay saved as drafts. Enable location permission and retake, or ask a supervisor for an exception.",
    gpsFailed: "Location unavailable or timed out. Retry when safe.",
    gpsOk: "GPS observation (untrusted)",
    gpsAge:
      "Each capture collects a fresh GPS reading. Stale or inaccurate readings require a retake or supervisor exception.",
    gpsWarning:
      "GPS and browser camera cannot prove physical presence or billboard identity.",
    challenge: "Online challenge",
    brandTitle: "Advertised brand",
    brandHelp: "Read the brand shown on the advertising face. Required before sending.",
    brandAdvertiser: "Brand visible",
    brandBlank: "Blank face",
    brandUnreadable: "Unreadable",
    brandName: "Brand name as shown",
    brandSaved: "Recorded on this device",
    brandNeeded: "Enter the advertised brand, or mark the face blank or unreadable, before sending.",
    brandLocked: "Brand recorded for this visit",
    angle: "Angle photograph",
    angleGuide: "Optional. Photograph the billboard from another side or further away, so the whole face and its supports show.",
    addAngle: "Add an angle photo",
    needAngle: "Add at least one angle photograph before sending.",
    needs_angle_photo: "This visit was saved before angle photos were required. Your photos are kept. Add one angle photo to send it.",
    challengeInfo:
      "A code from the server, sent while you were online. It helps the review, but does not prove the photo was taken on site.",
    noChallenge:
      "No server code for this photo. It will be marked as taken offline.",
    offlinePhoto: "Offline capture • device claim",
    challengedPhoto: "Online • challenge supplied (untrusted)",
    onlinePhoto: "Online • no challenge",
    saved: "Photo saved locally",
    notSaved: "Photo is not saved. Keep this page open and retry.",
    saveAgain: "Retry saving photo",
    storage_full:
      "Phone storage is full. Free some space and try again. The current photo is not saved yet.",
    storage_unavailable:
      "The browser cannot save photos right now. Keep this page open until the photo is saved.",
    queue: "Queue for upload",
    queueNote:
      "Both photographs are required. Queuing locks this evidence version; original blobs stay on this device until a confirmed receipt.",
    retry: "Retry synchronization",
    storage: "Device storage",
    persist: "Request persistent storage",
    persistent: "Persistent storage granted",
    evictable: "Your browser may delete unsent photos if storage runs low. Send them as soon as you can.",
    storageNote:
      "Private browsing, clearing site data or losing the device can erase unsent photos. Download tasks first and check receipts before leaving.",
    shellReady: "Offline shell ready",
    shellPending: "Offline shell not ready — stay online",
    install: "Install field app",
    installGuide:
      "On supported browsers, install this app from the browser menu. On iPhone use Share → Add to Home Screen.",
    retained:
      "Original local photos are retained after receipt. Browser keys cannot protect a compromised device.",
    session_expired:
      "Session expired. Sign in as the original worker, then retry.",
    account_mismatch:
      "Account changed or access denied. Sign in as the original worker.",
    task_conflict:
      "Task changed or upload conflict. Keep originals and contact your administrator.",
    validation_failed:
      "Server validation failed. Keep originals and contact your administrator.",
    verification_failed:
      "The server rejected a gallery photo. Replace it with the original from your gallery, then queue again.",
    chooseGallery: "Choose from gallery",
    galleryChecked:
      "Gallery original. After upload the server checks its date, GPS and distance from the billboard.",
    galleryHeic:
      "HEIC original saved. This browser cannot preview it; the server reads its metadata.",
    galleryNote:
      "Use an original photo from your phone gallery, not a screenshot or an edited copy.",
    verificationTitle: "Server verification",
    verificationApproved: "Approved",
    verificationRejected: "Rejected",
    verificationReview: "Needs supervisor review",
    verificationPending: "Waiting for server verification",
    galleryWarnNoLocationIos:
      "This photo has no location. On iPhone: Settings → Privacy & Security → Location Services → Camera → While Using, then take or choose the original photo again.",
    galleryWarnNoLocationAndroid:
      "This photo has no location. On Android: turn on location tags in the Camera app, or allow this browser to read photo locations (Settings → Apps → your browser → Photos and videos), then choose the original photo again.",
    galleryWarnNoLocation:
      "This photo has no location. Choose the original photo from your gallery with location turned on.",
    galleryWarnNoDate: "This photo has no capture date. Choose the original photo from your gallery.",
    galleryWarnUnreadable: "This photo's metadata cannot be read. Choose the original photo from your gallery.",
    galleryWarnOk: "Original photo selected. Location and date are checked by the server after upload.",
    connection_interrupted:
      "Connection interrupted. Your saved photos will retry with backoff.",
    safe: "Do not photograph while driving. GPS alone cannot distinguish adjacent faces.",
    missing: "Save front and wide-context photos before queuing.",
    downloadError:
      "Assignments could not be downloaded. Existing local copies remain available.",
    challengeExpired:
      "Challenge has expired; capture will be labeled unchallenged.",
    quota: "used / available quota",
    ready: "Ready for capture",
    removeNone: "No photos have been saved yet.",
    continue: "Continue inspection",
    history: "Saved inspections",
    refresh: "Refresh assignments",
    localReceiptWarning:
      "Local saving is not server receipt. Keep this browser data until synchronization succeeds.",
    photoTooLarge:
      "Photo exceeds the 6 MB limit. Retake with a lower camera resolution.",
    storageError: "Storage diagnostics unavailable.",
    privacy:
      "Location is collected only when you request a fix; there is no background tracking.",
  },
  ar: {
    title: "مساحة العمل الميداني",
    subtitle: "التقط الواجهة واحتفظ بسياق الموقع.",
    home: "مساحة العمليات",
    language: "English",
    theme: "تغيير المظهر",
    signout: "خروج / قفل الجهاز",
    online: "متصل",
    offline: "نسخة الجهاز دون اتصال",
    loading: "جارٍ فتح مساحة العمل الميداني…",
    signin: "سجّل الدخول لفتح المهام المحمّلة.",
    workerOnly: "يلزم حساب موظف ميداني للالتقاط.",
    download: "تنزيل المهام",
    downloaded: "محفوظة على هذا الجهاز",
    downloadFirst: "افتح زيارة لالتقاط صور مباشرة. نزّل المهام للعمل دون اتصال.",
    tasks: "زياراتي",
    empty: "لا توجد مهام متاحة.",
    open: "فتح المعاينة",
    back: "العودة للزيارات",
    locked: "هوية الواجهة الثابتة",
    original: "الموقع الأصلي المستورد",
    unverified: "إحداثيات غير موثّقة",
    uncertainty: "عدم الدقة",
    structure: "الهيكل / الاتجاه",
    due: "الاستحقاق",
    start: "بدء المعاينة",
    local: "محفوظة على هذا الجهاز",
    queued: "في الانتظار — لا يوجد إيصال خادم",
    uploading: "جارٍ الرفع — لم تُسلّم بعد",
    blocked: "تحتاج إلى إجراء — الأصول محفوظة",
    received: "استلمها الخادم — بانتظار المراجعة البشرية",
    receipt: "إيصال الخادم",
    deviceTime: "وقت الالتقاط حسب الجهاز",
    receivedTime: "وقت استلام الخادم",
    front: "صورة أمامية",
    wide: "صورة سياق واسعة",
    frontGuide: "أظهر الواجهة كاملة والحواف والرمز المقروء إن وجد.",
    wideGuide: "أظهر الهيكل والدعامات والطريق والمحيط. توقّف في مكان آمن فقط.",
    camera: "بدء الكاميرا المباشرة",
    stop: "إيقاف الكاميرا",
    capture: "التقاط",
    cameraDenied:
      "إذن الكاميرا مرفوض. اسمح باستخدامها من إعدادات المتصفح وحاول مجدداً.",
    cameraMissing:
      "الكاميرا غير متاحة. استخدم متصفحاً مدعوماً عبر HTTPS وتحقق من الجهاز.",
    cameraReady: "انتظر ظهور الصورة المباشرة قبل الالتقاط.",
    gps: "تسجيل الموقع",
    gpsBusy: "جارٍ الحصول على قراءة GPS حديثة…",
    gpsNone:
      "يُطلب الموقع تلقائياً لكل صورة. عند غيابه تبقى الصورة كمسودة حتى إعادة التقاطها أو موافقة المشرف على استثناء.",
    gpsDenied:
      "إذن الموقع مرفوض. الصور محفوظة كمسودات. اسمح بالموقع وأعد الالتقاط، أو اطلب استثناء من المشرف.",
    gpsFailed:
      "الموقع غير متاح أو انتهت المهلة. أعد المحاولة عندما يكون ذلك آمناً.",
    gpsOk: "قراءة GPS (غير موثوقة)",
    gpsAge:
      "تُجمع قراءة موقع حديثة لكل صورة. القراءة القديمة أو غير الدقيقة تتطلب إعادة الالتقاط أو استثناء المشرف.",
    gpsWarning:
      "الكاميرا وGPS في المتصفح لا يثبتان الحضور الفعلي أو هوية الواجهة.",
    challenge: "تحدٍ عبر الخادم",
    brandTitle: "العلامة التجارية المعلنة",
    brandHelp: "اقرأ العلامة التجارية الظاهرة على وجه الإعلان. مطلوبة قبل الإرسال.",
    brandAdvertiser: "علامة مرئية",
    brandBlank: "وجه فارغ",
    brandUnreadable: "غير مقروء",
    brandName: "اسم العلامة كما يظهر",
    brandSaved: "مسجّل على هذا الجهاز",
    brandNeeded: "أدخل العلامة التجارية المعلنة، أو حدّد أن الوجه فارغ أو غير مقروء، قبل الإرسال.",
    brandLocked: "تم تسجيل العلامة لهذه الزيارة",
    angle: "صورة بزاوية أخرى",
    angleGuide: "اختياري. صوّر اللوحة من جهة أخرى أو من مسافة أبعد، بحيث يظهر الوجه كاملاً ودعاماته.",
    addAngle: "إضافة صورة بزاوية أخرى",
    needAngle: "أضف صورة واحدة على الأقل بزاوية أخرى قبل الإرسال.",
    needs_angle_photo: "تم حفظ هذه الزيارة قبل اشتراط صور الزوايا. صورك محفوظة. أضف صورة زاوية واحدة لإرسالها.",
    challengeInfo:
      "رمز أرسله الخادم أثناء اتصالك. يساعد المراجعة، لكنه لا يثبت أن الصورة التُقطت في الموقع.",
    noChallenge:
      "لا يوجد رمز من الخادم لهذه الصورة. ستُسجَّل على أنها التُقطت دون اتصال.",
    offlinePhoto: "التقاط دون اتصال • ادعاء الجهاز",
    challengedPhoto: "متصل • مع تحدٍ (غير موثوق)",
    onlinePhoto: "متصل • دون تحدٍ",
    saved: "حُفظت الصورة محلياً",
    notSaved: "الصورة غير محفوظة. أبقِ الصفحة مفتوحة وأعد المحاولة.",
    saveAgain: "إعادة محاولة حفظ الصورة",
    storage_full:
      "مساحة الهاتف ممتلئة. احذف بعض الملفات ثم حاول مرة أخرى. الصورة الحالية غير محفوظة بعد.",
    storage_unavailable:
      "المتصفح لا يستطيع حفظ الصور الآن. ابقَ على هذه الصفحة مفتوحة حتى تُحفظ الصورة.",
    queue: "إضافة إلى قائمة الرفع",
    queueNote:
      "الصورتان مطلوبتان. إضافة الأدلة تثبّت هذه النسخة. تبقى الأصول على الجهاز حتى تأكيد الإيصال.",
    retry: "إعادة المزامنة",
    storage: "تخزين الجهاز",
    persist: "طلب تخزين دائم",
    persistent: "التخزين الدائم ممنوح",
    evictable: "قد يحذف المتصفح الصور غير المرسلة إذا قلّت المساحة. أرسلها في أقرب وقت.",
    storageNote:
      "التصفح الخاص أو مسح بيانات الموقع أو فقدان الجهاز قد يمحو الصور غير المرسلة. نزّل المهام أولاً وتأكد من الإيصالات قبل المغادرة.",
    shellReady: "واجهة عدم الاتصال جاهزة",
    shellPending: "واجهة عدم الاتصال غير جاهزة — ابقَ متصلاً",
    install: "تثبيت التطبيق الميداني",
    installGuide:
      "ثبّت التطبيق من قائمة المتصفح. على آيفون: مشاركة ← إضافة إلى الشاشة الرئيسية.",
    retained:
      "تبقى الصور الأصلية محلياً بعد الإيصال. مفاتيح المتصفح لا تحمي جهازاً مخترقاً.",
    session_expired:
      "انتهت الجلسة. سجّل الدخول بحساب الموظف الأصلي ثم أعد المحاولة.",
    account_mismatch:
      "تغيّر الحساب أو رُفض الوصول. سجّل الدخول بحساب الموظف الأصلي.",
    task_conflict:
      "تغيّرت المهمة أو تعارض الرفع. احتفظ بالأصول وتواصل مع المشرف.",
    validation_failed: "فشل تحقق الخادم. احتفظ بالأصول وتواصل مع المشرف.",
    verification_failed:
      "رفض الخادم صورة من المعرض. استبدلها بالصورة الأصلية من معرض هاتفك ثم أعد الإرسال إلى الطابور.",
    chooseGallery: "اختر من المعرض",
    galleryChecked:
      "نسخة أصلية من المعرض. بعد الرفع يتحقق الخادم من تاريخ الالتقاط والموقع والمسافة عن اللوحة.",
    galleryHeic:
      "حُفظت النسخة الأصلية بصيغة HEIC. هذا المتصفح لا يعرض معاينتها؛ ويقرأ الخادم بياناتها.",
    galleryNote:
      "استخدم صورة أصلية من معرض هاتفك، وليس لقطة شاشة أو نسخة معدّلة.",
    verificationTitle: "تحقق الخادم",
    verificationApproved: "مقبولة",
    verificationRejected: "مرفوضة",
    verificationReview: "تحتاج مراجعة المشرف",
    verificationPending: "بانتظار تحقق الخادم",
    galleryWarnNoLocationIos:
      "هذه الصورة لا تحتوي على موقع. على آيفون: الإعدادات ← الخصوصية والأمان ← خدمات الموقع ← الكاميرا ← أثناء الاستخدام، ثم التقط الصورة الأصلية أو اخترها مرة أخرى.",
    galleryWarnNoLocationAndroid:
      "هذه الصورة لا تحتوي على موقع. على أندرويد: فعّل وسوم الموقع في تطبيق الكاميرا، أو اسمح للمتصفح بقراءة مواقع الصور (الإعدادات ← التطبيقات ← المتصفح ← الصور والفيديو)، ثم اختر الصورة الأصلية مرة أخرى.",
    galleryWarnNoLocation:
      "هذه الصورة لا تحتوي على موقع. اختر الصورة الأصلية من معرض هاتفك مع تفعيل الموقع.",
    galleryWarnNoDate: "هذه الصورة لا تحتوي على تاريخ التقاط. اختر الصورة الأصلية من معرض هاتفك.",
    galleryWarnUnreadable: "لا يمكن قراءة بيانات هذه الصورة. اختر الصورة الأصلية من معرض هاتفك.",
    galleryWarnOk: "تم اختيار الصورة الأصلية. يتحقق الخادم من الموقع والتاريخ بعد الرفع.",
    connection_interrupted:
      "انقطع الاتصال. ستُعاد محاولة إرسال الصور المحفوظة تدريجياً.",
    safe: "لا تلتقط الصور أثناء القيادة. GPS وحده لا يميّز الواجهات المتجاورة.",
    missing: "احفظ الصورة الأمامية والسياق الواسع قبل الإرسال.",
    downloadError: "تعذّر تنزيل المهام. النسخ المحلية السابقة ما زالت متاحة.",
    challengeExpired: "انتهت صلاحية التحدي؛ سيُوسم الالتقاط بأنه دون تحدٍ.",
    quota: "المستخدم / الحصة المتاحة",
    ready: "جاهز للالتقاط",
    removeNone: "لم تُحفظ صور بعد.",
    continue: "متابعة المعاينة",
    history: "المعاينات المحفوظة",
    refresh: "تحديث المهام",
    localReceiptWarning:
      "الحفظ المحلي ليس إيصال خادم. احتفظ ببيانات المتصفح حتى نجاح المزامنة.",
    photoTooLarge: "تجاوزت الصورة حد ٦ ميغابايت. أعد الالتقاط بدقة أقل.",
    storageError: "تعذّر فحص مساحة التخزين.",
    privacy: "يُجمع الموقع فقط عند طلب القراءة؛ لا يوجد تتبّع في الخلفية.",
  },
};
export type FieldText = typeof fieldStrings.en;
