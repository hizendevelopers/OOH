// Worker-facing text for server verification reason codes. The server decides; these messages only explain.
type Message = { en: string; ar: string };

const byCode: Record<string, (tag: string) => Message> = {
  unsupported_or_corrupt: () => ({
    en: "This file is not a readable JPEG or HEIC photo. Choose the original photo from your gallery.",
    ar: "هذا الملف ليس صورة JPEG أو HEIC قابلة للقراءة. اختر الصورة الأصلية من معرض هاتفك.",
  }),
  exif_missing: (tag) => ({
    en: `The photo has no ${tag}. Screenshots and edited copies usually lack it. Turn on location for the camera and choose the original photo.`,
    ar: `الصورة لا تحتوي على ${tag === "DateTimeOriginal" ? "تاريخ الالتقاط" : /^GPS/.test(tag) ? "بيانات الموقع" : "بيانات مطلوبة"}. لقطات الشاشة والنسخ المعدّلة لا تحتويه غالباً. فعّل الموقع للكاميرا واختر الصورة الأصلية.`,
  }),
  exif_invalid: () => ({
    en: "The photo's date or location data cannot be read.",
    ar: "لا يمكن قراءة بيانات تاريخ الصورة أو موقعها.",
  }),
  capture_in_future: () => ({
    en: "The photo's date is in the future. Check the phone's clock.",
    ar: "تاريخ الصورة في المستقبل. تحقّق من ساعة الهاتف.",
  }),
  capture_date_mismatch: () => ({
    en: "The photo was taken on a different day from this visit.",
    ar: "التُقطت الصورة في يوم مختلف عن زيارة هذا الموقع.",
  }),
  distance_exceeded: () => ({
    en: "The photo was taken more than 100 m from the billboard.",
    ar: "التُقطت الصورة على بُعد أكثر من 100 م من اللوحة.",
  }),
  gps_null_island: () => ({
    en: "The photo's location is 0,0, which is not a real position.",
    ar: "موقع الصورة 0,0 وهذا ليس موقعاً حقيقياً.",
  }),
  gps_time_mismatch: () => ({
    en: "The GPS clock and the phone clock differ by more than 10 minutes. A supervisor will check it.",
    ar: "ساعة تحديد الموقع وساعة الهاتف تختلفان بأكثر من 10 دقائق. سيتحقق المشرف من ذلك.",
  }),
  site_configuration_error: () => ({
    en: "This billboard has no verified coordinates yet. A supervisor must fix the site before approval.",
    ar: "هذه اللوحة ليس لها إحداثيات موثّقة بعد. يجب أن يصححها المشرف قبل الاعتماد.",
  }),
  owner_mismatch: () => ({
    en: "The photo was not taken under this worker's account.",
    ar: "الصورة لم تُرفع من حساب هذا الموظف.",
  }),
  assignment_mismatch: () => ({
    en: "The photo does not belong to this visit.",
    ar: "الصورة لا تنتمي إلى هذه الزيارة.",
  }),
  duplicate_exact: () => ({
    en: "This exact photo was already used for another visit.",
    ar: "هذه الصورة نفسها استُخدمت مسبقاً في زيارة أخرى.",
  }),
  duplicate_candidate: () => ({
    en: "A very similar photo exists. A supervisor will check it.",
    ar: "توجد صورة مشابهة جداً. سيتحقق منها المشرف.",
  }),
};

export function verificationReason(code: string, arabic: boolean) {
  const [head, ...rest] = code.split(":");
  const make = byCode[head];
  const message = make
    ? make(rest.join(":"))
    : { en: "The photo needs checking.", ar: "الصورة تحتاج إلى مراجعة." };
  return arabic ? message.ar : message.en;
}
