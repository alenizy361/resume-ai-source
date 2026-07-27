/**
 * Cached role packs: what a job title suggests, known before any model is called.
 *
 * The form-first door has to answer the instant someone types "أخصائي أشعة" —
 * a spinner at that moment reads as "the tool does not know my job", and the
 * user leaves before the first suggestion lands. A round trip cannot be fast
 * enough, so the common occupations are shipped as data and served locally.
 * AI enrichment runs afterwards, in the background, on top of what is already
 * on screen.
 *
 * ONE CONTENT RULE GOVERNS EVERY STRING IN THIS FILE:
 *
 *     No numbers. No percentages. No volumes, team sizes or metrics.
 *     Not even a bracketed placeholder.
 *
 * A duty here describes the work; a result belongs to the person who achieved
 * it and reported it. "Performed diagnostic imaging examinations to approved
 * protocols" is something a radiographer did. "Performed 40 examinations daily,
 * improving throughput 20%" is something this file would be inventing on their
 * behalf — and the moment one invented figure reaches a CV, nothing else on it
 * is trustworthy either. `ops/rolepacks.test.mjs` scans every string for a
 * digit, so the rule is enforced rather than remembered.
 *
 * Credentials are likewise POSSIBLE credentials, offered unchecked, never held.
 * The pack says "SCFHS Professional Registration exists for this job"; only the
 * user can say they have it.
 */

import { normalizeLabel, type CredentialKind } from "./builderDoc.ts";

/** A label the UI shows in both languages; neither side is ever the fallback. */
export interface Bilingual {
  en: string;
  ar: string;
}

export interface RolePack {
  slug: string;
  title: Bilingual;
  /** Alternative titles in both languages. Matching fodder, not display text. */
  aliases: string[];
  /** Suggestion categories, grouped because a flat list of thirty is unreadable. */
  groups: Array<{
    label: Bilingual;
    items: Bilingual[];
  }>;
  /** Typical responsibilities — offered as duties, confirmed one by one. */
  duties: Bilingual[];
  /** Credentials this occupation COULD hold. Never pre-checked. */
  credentials: Array<{ kind: CredentialKind; title: Bilingual; issuer?: string }>;
  /** Terms an ATS scans for. Not shown as content; used for keyword coverage. */
  keywords: string[];
}

/* ─────────────────────── the packs ─────────────────────── */

const RADIOLOGY_TECHNOLOGIST: RolePack = {
  slug: "radiology-technologist",
  title: { en: "Radiology Technologist", ar: "أخصائي أشعة" },
  aliases: [
    "Radiologic Technologist",
    "Radiographer",
    "Diagnostic Radiographer",
    "Radiology Technician",
    "X-ray Technician",
    "Medical Imaging Technologist",
    "Imaging Technologist",
    "أخصائي أشعة",
    "اخصائي الأشعة التشخيصية",
    "فني أشعة",
    "تقني أشعة",
    "أخصائي تصوير طبي",
    "فني تصوير طبي",
    "أشعة",
  ],
  groups: [
    {
      label: { en: "Modalities", ar: "طرائق التصوير" },
      items: [
        { en: "General X-ray", ar: "التصوير الشعاعي العام" },
        { en: "Computed Tomography", ar: "التصوير المقطعي المحوسب" },
        { en: "Magnetic Resonance Imaging", ar: "التصوير بالرنين المغناطيسي" },
        { en: "Fluoroscopy", ar: "التنظير الفلوري" },
        { en: "Mammography", ar: "تصوير الثدي الشعاعي" },
        { en: "Bone Mineral Density", ar: "قياس كثافة معادن العظام" },
        { en: "Mobile imaging", ar: "التصوير المتنقل" },
        { en: "Operating-room imaging", ar: "التصوير داخل غرف العمليات" },
      ],
    },
    {
      label: { en: "Systems", ar: "الأنظمة" },
      items: [
        { en: "PACS", ar: "نظام أرشفة الصور ونقلها" },
        { en: "RIS", ar: "نظام معلومات الأشعة" },
        { en: "DICOM", ar: "معيار دايكوم لتبادل الصور الطبية" },
        { en: "Modality worklist", ar: "قائمة عمل الجهاز" },
        { en: "Worklist management", ar: "إدارة قوائم العمل" },
      ],
    },
    {
      label: { en: "Clinical & Safety", ar: "المهارات السريرية والسلامة" },
      items: [
        { en: "Patient identification", ar: "التحقق من هوية المريض" },
        { en: "Patient positioning", ar: "تحديد وضعية المريض" },
        { en: "Image-quality assessment", ar: "تقييم جودة الصورة" },
        { en: "Radiation protection", ar: "الوقاية من الإشعاع" },
        { en: "Infection control", ar: "مكافحة العدوى" },
        { en: "Contrast-media safety", ar: "سلامة استخدام مواد التباين" },
        { en: "Emergency imaging", ar: "التصوير في الحالات الطارئة" },
        { en: "Pediatric imaging", ar: "تصوير الأطفال" },
        { en: "Quality control", ar: "ضبط الجودة" },
        { en: "Equipment fault escalation", ar: "تصعيد أعطال الأجهزة" },
      ],
    },
  ],
  duties: [
    {
      en: "Performed diagnostic imaging examinations according to approved clinical protocols.",
      ar: "أجرى فحوصات التصوير التشخيصي وفق البروتوكولات السريرية المعتمدة.",
    },
    {
      en: "Verified patient identity and the examination request before every procedure.",
      ar: "تحقق من هوية المريض وطلب الفحص قبل كل إجراء.",
    },
    {
      en: "Positioned patients and selected exposure factors to obtain diagnostic image quality.",
      ar: "حدد وضعية المريض واختار عوامل التعريض للحصول على جودة صورة تشخيصية.",
    },
    {
      en: "Applied radiation protection measures for patients, staff and accompanying persons.",
      ar: "طبّق إجراءات الوقاية من الإشعاع للمرضى والعاملين والمرافقين.",
    },
    {
      en: "Reviewed acquired images for technical adequacy and repeated views when clinically required.",
      ar: "راجع الصور الملتقطة للتأكد من كفايتها الفنية وأعاد الوضعيات عند الحاجة السريرية.",
    },
    {
      en: "Prepared and administered contrast media under the supervision of the radiologist.",
      ar: "جهّز مواد التباين وأعطاها تحت إشراف طبيب الأشعة.",
    },
    {
      en: "Transferred, labelled and archived studies through PACS and the radiology information system.",
      ar: "نقل الدراسات ووسمها وأرشفها عبر نظام أرشفة الصور ونظام معلومات الأشعة.",
    },
    {
      en: "Managed the modality worklist and reconciled examination data against the clinical request.",
      ar: "أدار قائمة عمل الجهاز وطابق بيانات الفحص مع الطلب السريري.",
    },
    {
      en: "Supported portable and operating-room imaging for patients who could not be moved to the department.",
      ar: "قدّم خدمات التصوير المتنقل والتصوير داخل غرف العمليات للمرضى غير القابلين للنقل إلى القسم.",
    },
    {
      en: "Carried out routine quality-control checks and escalated equipment faults to biomedical engineering.",
      ar: "نفّذ فحوصات ضبط الجودة الروتينية وصعّد أعطال الأجهزة إلى الهندسة الطبية.",
    },
    {
      en: "Applied infection-control precautions when cleaning imaging equipment and accessories between patients.",
      ar: "طبّق احتياطات مكافحة العدوى في تنظيف أجهزة التصوير وملحقاتها بين المرضى.",
    },
    {
      en: "Explained examination steps to patients and answered their questions before imaging.",
      ar: "شرح خطوات الفحص للمرضى وأجاب استفساراتهم قبل التصوير.",
    },
  ],
  credentials: [
    {
      kind: "registration",
      title: { en: "SCFHS Professional Registration", ar: "التسجيل المهني في الهيئة السعودية للتخصصات الصحية" },
      issuer: "SCFHS",
    },
    {
      // Registration and classification are two separate SCFHS acts with separate
      // documents; a CV that merges them reads as if the person misunderstands
      // their own licensing.
      kind: "classification",
      title: { en: "SCFHS Professional Classification", ar: "التصنيف المهني في الهيئة السعودية للتخصصات الصحية" },
      issuer: "SCFHS",
    },
    {
      kind: "certification",
      title: { en: "Basic Life Support (BLS)", ar: "دعم الحياة الأساسي" },
    },
    {
      kind: "training",
      title: { en: "Radiation Safety Training", ar: "تدريب السلامة الإشعاعية" },
    },
    {
      kind: "certification",
      title: { en: "Radiation Protection Officer (RSO)", ar: "مسؤول الوقاية من الإشعاع" },
    },
    {
      kind: "training",
      title: { en: "Infection Control Training", ar: "تدريب مكافحة العدوى" },
    },
  ],
  keywords: [
    "Radiology Technologist", "Radiographer", "Diagnostic Imaging", "General X-ray",
    "Computed Tomography", "Magnetic Resonance Imaging", "Fluoroscopy", "Mammography",
    "PACS", "RIS", "DICOM", "Modality Worklist", "Radiation Protection", "Contrast Media",
    "Patient Positioning", "Image Quality", "Infection Control", "SCFHS",
    "أخصائي أشعة", "التصوير التشخيصي", "التصوير المقطعي", "الرنين المغناطيسي",
    "الوقاية من الإشعاع", "مكافحة العدوى",
  ],
};

const ACCOUNTANT: RolePack = {
  slug: "accountant",
  title: { en: "Accountant", ar: "محاسب" },
  aliases: [
    "General Accountant",
    "Financial Accountant",
    "Staff Accountant",
    "Accounting Specialist",
    "محاسب",
    "محاسب عام",
    "محاسب مالي",
    "أخصائي محاسبة",
    "موظف محاسبة",
    "محاسب أول",
  ],
  groups: [
    {
      label: { en: "Accounting", ar: "المحاسبة" },
      items: [
        { en: "General ledger", ar: "دفتر الأستاذ العام" },
        { en: "Accounts payable", ar: "الحسابات الدائنة" },
        { en: "Accounts receivable", ar: "الحسابات المدينة" },
        { en: "Bank reconciliation", ar: "التسوية البنكية" },
        { en: "Fixed-asset register", ar: "سجل الأصول الثابتة" },
        { en: "Month-end closing", ar: "الإقفال الشهري" },
        { en: "Accruals and prepayments", ar: "المستحقات والمصروفات المقدمة" },
        { en: "Payroll processing", ar: "إعداد الرواتب" },
      ],
    },
    {
      label: { en: "Systems", ar: "الأنظمة" },
      items: [
        { en: "SAP", ar: "نظام ساب" },
        { en: "Oracle Financials", ar: "أوراكل المالية" },
        { en: "Microsoft Excel", ar: "مايكروسوفت إكسل" },
        { en: "QuickBooks", ar: "كويك بوكس" },
        { en: "Odoo", ar: "أودو" },
        { en: "ERP financial modules", ar: "الوحدات المالية في أنظمة تخطيط الموارد" },
      ],
    },
    {
      label: { en: "Compliance & Reporting", ar: "الالتزام والتقارير" },
      items: [
        { en: "Value Added Tax returns", ar: "إقرارات ضريبة القيمة المضافة" },
        { en: "Zakat and tax filing", ar: "تقديم الزكاة والضريبة" },
        { en: "IFRS reporting", ar: "التقارير وفق المعايير الدولية" },
        { en: "Financial statement preparation", ar: "إعداد القوائم المالية" },
        { en: "Internal controls", ar: "الرقابة الداخلية" },
        { en: "Audit support", ar: "دعم أعمال التدقيق" },
        { en: "Cost analysis", ar: "تحليل التكاليف" },
        { en: "Budget preparation", ar: "إعداد الموازنات" },
      ],
    },
  ],
  duties: [
    {
      en: "Recorded daily financial transactions in the general ledger according to the approved chart of accounts.",
      ar: "سجّل المعاملات المالية اليومية في دفتر الأستاذ العام وفق شجرة الحسابات المعتمدة.",
    },
    {
      en: "Reviewed supplier invoices and payment requests for accuracy and approval before disbursement.",
      ar: "راجع فواتير الموردين وطلبات الدفع من حيث الدقة والاعتماد قبل الصرف.",
    },
    {
      en: "Reconciled bank statements with the accounting records and investigated differences.",
      ar: "طابق كشوف الحسابات البنكية مع السجلات المحاسبية وتحقق من الفروقات.",
    },
    {
      en: "Followed up customer accounts and the collection of outstanding receivables.",
      ar: "تابع حسابات العملاء وتحصيل الذمم المدينة المستحقة.",
    },
    {
      en: "Prepared journal entries for accruals, prepayments and depreciation.",
      ar: "أعدّ قيود اليومية للمستحقات والمصروفات المقدمة والإهلاك.",
    },
    {
      en: "Participated in month-end and year-end closing procedures.",
      ar: "شارك في إجراءات الإقفال الشهري والسنوي.",
    },
    {
      en: "Maintained the fixed-asset register and recorded additions and disposals.",
      ar: "حافظ على سجل الأصول الثابتة وسجّل الإضافات والاستبعادات.",
    },
    {
      en: "Prepared Value Added Tax returns and the supporting schedules for filing.",
      ar: "أعدّ إقرارات ضريبة القيمة المضافة والجداول المساندة للتقديم.",
    },
    {
      en: "Applied internal control procedures over cash and petty-cash transactions.",
      ar: "طبّق إجراءات الرقابة الداخلية على المعاملات النقدية والسلف المستديمة.",
    },
    {
      en: "Provided documents and clarifications requested by internal and external auditors.",
      ar: "وفّر المستندات والإيضاحات التي طلبها المدققون الداخليون والخارجيون.",
    },
    {
      en: "Prepared periodic financial reports for management review.",
      ar: "أعدّ التقارير المالية الدورية لمراجعة الإدارة.",
    },
  ],
  credentials: [
    { kind: "membership", title: { en: "SOCPA Membership", ar: "عضوية الهيئة السعودية للمراجعين والمحاسبين" }, issuer: "SOCPA" },
    { kind: "certification", title: { en: "Certified Public Accountant (CPA)", ar: "محاسب قانوني معتمد" } },
    { kind: "certification", title: { en: "Certified Management Accountant (CMA)", ar: "محاسب إداري معتمد" } },
    { kind: "training", title: { en: "IFRS Training", ar: "تدريب المعايير الدولية للتقرير المالي" } },
    { kind: "training", title: { en: "Value Added Tax Training", ar: "تدريب ضريبة القيمة المضافة" }, issuer: "ZATCA" },
  ],
  keywords: [
    "Accountant", "General Ledger", "Accounts Payable", "Accounts Receivable",
    "Bank Reconciliation", "Financial Statements", "Month-End Closing", "IFRS",
    "Value Added Tax", "Zakat", "Fixed Assets", "SAP", "Oracle", "Microsoft Excel",
    "Internal Controls", "Audit",
    "محاسب", "دفتر الأستاذ", "التسوية البنكية", "القوائم المالية",
    "ضريبة القيمة المضافة", "الرقابة الداخلية",
  ],
};

const CASHIER: RolePack = {
  slug: "cashier",
  title: { en: "Cashier", ar: "أمين صندوق" },
  aliases: [
    "Retail Cashier",
    "Store Cashier",
    "Checkout Cashier",
    "Point of Sale Cashier",
    "Sales Cashier",
    "Retail Sales Assistant",
    "أمين صندوق",
    "كاشير",
    "موظف صندوق",
    "محصل نقدي",
    "بائع تجزئة",
    "موظف بيع بالتجزئة",
  ],
  groups: [
    {
      label: { en: "Point of Sale", ar: "نقاط البيع" },
      items: [
        { en: "Point of sale operation", ar: "تشغيل نقاط البيع" },
        { en: "Cash handling", ar: "التعامل مع النقد" },
        { en: "Card and digital payments", ar: "المدفوعات بالبطاقات والمحافظ الرقمية" },
        { en: "Returns and exchanges", ar: "الإرجاع والاستبدال" },
        { en: "Shift cash reconciliation", ar: "تسوية نقدية الوردية" },
        { en: "Invoicing and receipts", ar: "إصدار الفواتير والإيصالات" },
      ],
    },
    {
      label: { en: "Customer Service", ar: "خدمة العملاء" },
      items: [
        { en: "Customer enquiries", ar: "استفسارات العملاء" },
        { en: "Complaint handling", ar: "التعامل مع الشكاوى" },
        { en: "Loyalty programmes", ar: "برامج الولاء" },
        { en: "Promotions and discounts", ar: "العروض والخصومات" },
        { en: "Upselling and cross-selling", ar: "البيع الإضافي والبيع المتقاطع" },
      ],
    },
    {
      label: { en: "Store Operations", ar: "عمليات المتجر" },
      items: [
        { en: "Shelf replenishment", ar: "تعبئة الرفوف" },
        { en: "Stock counting", ar: "جرد المخزون" },
        { en: "Product labelling", ar: "وسم المنتجات" },
        { en: "Expiry date checks", ar: "التحقق من تواريخ الصلاحية" },
        { en: "Loss prevention", ar: "منع الخسائر" },
        { en: "Workplace safety", ar: "السلامة في مكان العمل" },
      ],
    },
  ],
  duties: [
    {
      en: "Operated the point-of-sale system to process purchases, returns and exchanges.",
      ar: "شغّل نظام نقاط البيع لإتمام عمليات الشراء والإرجاع والاستبدال.",
    },
    {
      en: "Handled cash, card and digital payments and issued receipts to customers.",
      ar: "تعامل مع المدفوعات النقدية والبطاقات والمحافظ الرقمية وأصدر الإيصالات للعملاء.",
    },
    {
      en: "Counted the cash drawer at the start and end of the shift and reported variances to the supervisor.",
      ar: "جرد صندوق النقد في بداية الوردية ونهايتها وأبلغ المشرف عن الفروقات.",
    },
    {
      en: "Applied promotions, discounts and loyalty programme benefits at checkout.",
      ar: "طبّق العروض والخصومات ومزايا برامج الولاء عند نقطة الدفع.",
    },
    {
      en: "Answered customer enquiries about products, prices and availability.",
      ar: "أجاب استفسارات العملاء عن المنتجات والأسعار وتوافرها.",
    },
    {
      en: "Resolved checkout complaints and escalated cases beyond his authority to the shift supervisor.",
      ar: "عالج شكاوى نقطة الدفع وأحال ما يتجاوز صلاحياته إلى مشرف الوردية.",
    },
    {
      en: "Kept the checkout area clean, organised and ready for service.",
      ar: "حافظ على نظافة منطقة الدفع وتنظيمها وجهوزيتها للخدمة.",
    },
    {
      en: "Replenished shelves and checked product labels and expiry dates.",
      ar: "أعاد تعبئة الرفوف وتحقق من ملصقات المنتجات وتواريخ صلاحيتها.",
    },
    {
      en: "Supported stock counts and reported shortages and damaged items.",
      ar: "ساند عمليات جرد المخزون وأبلغ عن النواقص والأصناف التالفة.",
    },
    {
      en: "Followed loss-prevention and safety procedures on the sales floor.",
      ar: "التزم بإجراءات منع الخسائر والسلامة في صالة البيع.",
    },
    {
      en: "Reconciled shift sales totals and handed the cash float over to the next cashier.",
      ar: "طابق إجماليات مبيعات الوردية وسلّم عهدة الصندوق إلى الكاشير التالي.",
    },
  ],
  credentials: [
    { kind: "training", title: { en: "Point of Sale Systems Training", ar: "تدريب أنظمة نقاط البيع" } },
    { kind: "training", title: { en: "Cash Handling Training", ar: "تدريب التعامل مع النقد" } },
    { kind: "certification", title: { en: "Customer Service Certificate", ar: "شهادة خدمة العملاء" } },
    { kind: "training", title: { en: "Occupational Safety Awareness Training", ar: "تدريب التوعية بالسلامة المهنية" } },
    { kind: "training", title: { en: "Food Handling Training", ar: "تدريب تداول الأغذية" } },
  ],
  keywords: [
    "Cashier", "Point of Sale", "Cash Handling", "Customer Service", "Retail",
    "Returns and Exchanges", "Loyalty Programme", "Stock Counting", "Loss Prevention",
    "Shelf Replenishment", "Invoicing",
    "أمين صندوق", "كاشير", "نقاط البيع", "خدمة العملاء", "البيع بالتجزئة", "جرد المخزون",
  ],
};

const REGISTERED_NURSE: RolePack = {
  slug: "registered-nurse",
  title: { en: "Registered Nurse", ar: "ممرض مسجل" },
  aliases: [
    "RN",
    "Staff Nurse",
    "Clinical Nurse",
    "Nurse",
    "Ward Nurse",
    "ممرض",
    "ممرضة",
    "ممرض مسجل",
    "أخصائي تمريض",
    "فني تمريض",
    "تمريض",
  ],
  groups: [
    {
      label: { en: "Clinical Care", ar: "الرعاية السريرية" },
      items: [
        { en: "Patient assessment", ar: "تقييم المريض" },
        { en: "Vital signs monitoring", ar: "مراقبة العلامات الحيوية" },
        { en: "Medication administration", ar: "إعطاء الأدوية" },
        { en: "Intravenous cannulation", ar: "تركيب القنية الوريدية" },
        { en: "Wound care and dressing", ar: "العناية بالجروح والتضميد" },
        { en: "Nursing care planning", ar: "تخطيط الرعاية التمريضية" },
        { en: "Patient and family education", ar: "توعية المريض وأسرته" },
        { en: "Discharge planning", ar: "التخطيط للتخريج" },
      ],
    },
    {
      label: { en: "Safety & Quality", ar: "السلامة والجودة" },
      items: [
        { en: "Patient identification", ar: "التحقق من هوية المريض" },
        { en: "Infection prevention and control", ar: "الوقاية من العدوى ومكافحتها" },
        { en: "Medication safety", ar: "سلامة الدواء" },
        { en: "Fall risk assessment", ar: "تقييم مخاطر السقوط" },
        { en: "Pressure injury prevention", ar: "الوقاية من إصابات الضغط" },
        { en: "Incident reporting", ar: "الإبلاغ عن الحوادث" },
        { en: "Shift handover", ar: "تسليم الوردية" },
      ],
    },
    {
      label: { en: "Systems & Records", ar: "الأنظمة والسجلات" },
      items: [
        { en: "Electronic medical records", ar: "السجلات الطبية الإلكترونية" },
        { en: "Nursing documentation", ar: "التوثيق التمريضي" },
        { en: "Physician order entry", ar: "إدخال أوامر الطبيب" },
        { en: "Medical device operation", ar: "تشغيل الأجهزة الطبية" },
      ],
    },
  ],
  duties: [
    {
      en: "Assessed patients on admission and documented findings in the nursing record.",
      ar: "قيّم المرضى عند القبول ووثّق النتائج في الملف التمريضي.",
    },
    {
      en: "Administered prescribed medication and monitored patients for adverse reactions.",
      ar: "أعطى الأدوية الموصوفة وراقب المرضى تحسباً للتفاعلات الضائرة.",
    },
    {
      en: "Monitored vital signs and reported changes in patient condition to the treating physician.",
      ar: "راقب العلامات الحيوية وأبلغ الطبيب المعالج بالتغيرات في حالة المريض.",
    },
    {
      en: "Implemented individual nursing care plans in coordination with the multidisciplinary team.",
      ar: "نفّذ خطط الرعاية التمريضية الفردية بالتنسيق مع الفريق متعدد التخصصات.",
    },
    {
      en: "Prepared patients and equipment for clinical procedures and assisted the physician during them.",
      ar: "هيّأ المرضى والأجهزة للإجراءات السريرية وساعد الطبيب أثناء تنفيذها.",
    },
    {
      en: "Applied infection prevention precautions in all patient-care activities.",
      ar: "طبّق احتياطات الوقاية من العدوى في جميع أنشطة رعاية المريض.",
    },
    {
      en: "Verified patient identity and medication details before every administration.",
      ar: "تحقق من هوية المريض وتفاصيل الدواء قبل كل إعطاء.",
    },
    {
      en: "Educated patients and their families on medication use, wound care and follow-up appointments.",
      ar: "وعّى المرضى وأسرهم بشأن استخدام الأدوية والعناية بالجروح ومواعيد المتابعة.",
    },
    {
      en: "Responded to emergency calls and participated in resuscitation as a member of the team.",
      ar: "استجاب لنداءات الطوارئ وشارك في الإنعاش كعضو في الفريق.",
    },
    {
      en: "Carried out a complete shift handover covering patient status and pending tasks.",
      ar: "نفّذ تسليم وردية كاملاً يشمل حالة المرضى والمهام المعلقة.",
    },
    {
      en: "Reported incidents and near misses through the hospital reporting system.",
      ar: "أبلغ عن الحوادث والحوادث الوشيكة عبر نظام الإبلاغ في المستشفى.",
    },
  ],
  credentials: [
    {
      kind: "registration",
      title: { en: "SCFHS Professional Registration", ar: "التسجيل المهني في الهيئة السعودية للتخصصات الصحية" },
      issuer: "SCFHS",
    },
    {
      kind: "classification",
      title: { en: "SCFHS Professional Classification", ar: "التصنيف المهني في الهيئة السعودية للتخصصات الصحية" },
      issuer: "SCFHS",
    },
    { kind: "certification", title: { en: "Basic Life Support (BLS)", ar: "دعم الحياة الأساسي" } },
    { kind: "certification", title: { en: "Advanced Cardiovascular Life Support (ACLS)", ar: "دعم الحياة القلبي المتقدم" } },
    { kind: "training", title: { en: "Infection Control Training", ar: "تدريب مكافحة العدوى" } },
    { kind: "training", title: { en: "Medication Safety Training", ar: "تدريب سلامة الدواء" } },
  ],
  keywords: [
    "Registered Nurse", "Patient Care", "Patient Assessment", "Medication Administration",
    "Vital Signs", "Infection Control", "Wound Care", "Electronic Medical Records",
    "Shift Handover", "Basic Life Support", "SCFHS", "Patient Safety",
    "ممرض مسجل", "تمريض", "رعاية المريض", "إعطاء الأدوية", "مكافحة العدوى", "سلامة المريض",
  ],
};

const SALES_MANAGER: RolePack = {
  slug: "sales-manager",
  title: { en: "Sales Manager", ar: "مدير مبيعات" },
  aliases: [
    "Area Sales Manager",
    "Regional Sales Manager",
    "Sales Supervisor",
    "Head of Sales",
    "Branch Sales Manager",
    "مدير مبيعات",
    "مدير المبيعات",
    "مشرف مبيعات",
    "رئيس قسم المبيعات",
    "مدير مبيعات المنطقة",
    "مبيعات",
  ],
  groups: [
    {
      label: { en: "Sales Management", ar: "إدارة المبيعات" },
      items: [
        { en: "Sales planning", ar: "تخطيط المبيعات" },
        { en: "Territory management", ar: "إدارة المناطق البيعية" },
        { en: "Pipeline management", ar: "إدارة مسار الفرص البيعية" },
        { en: "Key account management", ar: "إدارة العملاء الرئيسيين" },
        { en: "Channel and distributor management", ar: "إدارة القنوات والموزعين" },
        { en: "Sales forecasting", ar: "التنبؤ بالمبيعات" },
        { en: "Pricing and quotations", ar: "التسعير وإعداد العروض" },
      ],
    },
    {
      label: { en: "Team & Customers", ar: "الفريق والعملاء" },
      items: [
        { en: "Team leadership", ar: "قيادة الفريق" },
        { en: "Coaching and development", ar: "التدريب والتطوير" },
        { en: "Performance review", ar: "مراجعة الأداء" },
        { en: "Negotiation", ar: "التفاوض" },
        { en: "Customer relationship building", ar: "بناء علاقات العملاء" },
        { en: "Complaint resolution", ar: "معالجة الشكاوى" },
      ],
    },
    {
      label: { en: "Tools & Analysis", ar: "الأدوات والتحليل" },
      items: [
        { en: "Customer relationship management systems", ar: "أنظمة إدارة علاقات العملاء" },
        { en: "Market analysis", ar: "تحليل السوق" },
        { en: "Competitor analysis", ar: "تحليل المنافسين" },
        { en: "Sales reporting", ar: "تقارير المبيعات" },
        { en: "Microsoft Excel", ar: "مايكروسوفت إكسل" },
      ],
    },
  ],
  duties: [
    {
      en: "Led the sales team's daily activity and the territory coverage plan.",
      ar: "قاد النشاط اليومي لفريق المبيعات وخطة تغطية المناطق البيعية.",
    },
    {
      en: "Prepared sales plans and forecasts for review by senior management.",
      ar: "أعدّ خطط المبيعات وتوقعاتها لمراجعة الإدارة العليا.",
    },
    {
      en: "Negotiated commercial terms and concluded agreements with key accounts.",
      ar: "تفاوض على الشروط التجارية وأبرم الاتفاقيات مع العملاء الرئيسيين.",
    },
    {
      en: "Monitored the sales pipeline through the customer relationship management system.",
      ar: "تابع مسار الفرص البيعية من خلال نظام إدارة علاقات العملاء.",
    },
    {
      en: "Recruited, coached and appraised sales representatives.",
      ar: "وظّف مندوبي المبيعات ودرّبهم وقيّم أداءهم.",
    },
    {
      en: "Analysed market and competitor activity to guide pricing and positioning decisions.",
      ar: "حلّل نشاط السوق والمنافسين لتوجيه قرارات التسعير والتموضع.",
    },
    {
      en: "Reviewed distributor and channel-partner performance against the agreed plans.",
      ar: "راجع أداء الموزعين وشركاء القنوات مقارنة بالخطط المتفق عليها.",
    },
    {
      en: "Followed up the collection of customer balances with the finance department.",
      ar: "تابع تحصيل أرصدة العملاء مع الإدارة المالية.",
    },
    {
      en: "Handled escalated customer issues while protecting the commercial relationship.",
      ar: "عالج قضايا العملاء المصعّدة مع الحفاظ على العلاقة التجارية.",
    },
    {
      en: "Represented the company at exhibitions and customer meetings.",
      ar: "مثّل الشركة في المعارض ولقاءات العملاء.",
    },
    {
      en: "Reported sales results and pipeline status to management.",
      ar: "رفع تقارير نتائج المبيعات وحالة الفرص البيعية إلى الإدارة.",
    },
  ],
  credentials: [
    { kind: "certification", title: { en: "Certified Sales Professional", ar: "أخصائي مبيعات معتمد" } },
    { kind: "training", title: { en: "Negotiation Skills Training", ar: "تدريب مهارات التفاوض" } },
    { kind: "training", title: { en: "Key Account Management Training", ar: "تدريب إدارة العملاء الرئيسيين" } },
    { kind: "training", title: { en: "Customer Relationship Management Systems Training", ar: "تدريب أنظمة إدارة علاقات العملاء" } },
    { kind: "membership", title: { en: "Sales and Marketing Professional Membership", ar: "عضوية مهنية في المبيعات والتسويق" } },
  ],
  keywords: [
    "Sales Manager", "Sales Planning", "Territory Management", "Key Accounts",
    "Pipeline Management", "Sales Forecasting", "Negotiation", "Team Leadership",
    "Customer Relationship Management", "Market Analysis", "Distributor Management",
    "مدير مبيعات", "تخطيط المبيعات", "العملاء الرئيسيون", "التفاوض", "قيادة الفريق",
    "إدارة علاقات العملاء",
  ],
};

const ADMINISTRATIVE_ASSISTANT: RolePack = {
  slug: "administrative-assistant",
  title: { en: "Administrative Assistant", ar: "مساعد إداري" },
  aliases: [
    "Admin Assistant",
    "Office Administrator",
    "Executive Assistant",
    "Secretary",
    "Office Clerk",
    "Administrative Coordinator",
    "مساعد إداري",
    "مساعد تنفيذي",
    "سكرتير",
    "سكرتيرة",
    "موظف إداري",
    "مسؤول إداري",
    "كاتب إداري",
    "إداري",
  ],
  groups: [
    {
      label: { en: "Office Administration", ar: "الإدارة المكتبية" },
      items: [
        { en: "Calendar and appointment management", ar: "إدارة الجداول والمواعيد" },
        { en: "Meeting coordination", ar: "تنسيق الاجتماعات" },
        { en: "Minutes of meetings", ar: "محاضر الاجتماعات" },
        { en: "Travel and accommodation arrangements", ar: "ترتيبات السفر والإقامة" },
        { en: "Office supplies requisition", ar: "طلب اللوازم المكتبية" },
        { en: "Visitor reception", ar: "استقبال الزوار" },
      ],
    },
    {
      label: { en: "Documents & Correspondence", ar: "المستندات والمراسلات" },
      items: [
        { en: "Business correspondence", ar: "المراسلات الإدارية" },
        { en: "Bilingual drafting", ar: "الصياغة بلغتين" },
        { en: "Filing and archiving", ar: "الحفظ والأرشفة" },
        { en: "Records management", ar: "إدارة السجلات" },
        { en: "Document control", ar: "ضبط المستندات" },
        { en: "Data entry", ar: "إدخال البيانات" },
        { en: "Confidentiality of information", ar: "سرية المعلومات" },
      ],
    },
    {
      label: { en: "Systems", ar: "الأنظمة" },
      items: [
        { en: "Microsoft Word", ar: "مايكروسوفت وورد" },
        { en: "Microsoft Excel", ar: "مايكروسوفت إكسل" },
        { en: "Microsoft Outlook", ar: "مايكروسوفت أوتلوك" },
        { en: "Microsoft PowerPoint", ar: "مايكروسوفت بوربوينت" },
        { en: "Electronic correspondence systems", ar: "أنظمة المراسلات الإلكترونية" },
        { en: "ERP self-service modules", ar: "وحدات الخدمة الذاتية في أنظمة تخطيط الموارد" },
      ],
    },
  ],
  duties: [
    {
      en: "Managed the manager's calendar, appointments and meeting arrangements.",
      ar: "أدار جدول المدير ومواعيده وترتيبات اجتماعاته.",
    },
    {
      en: "Handled incoming correspondence and directed it to the concerned departments.",
      ar: "تعامل مع المراسلات الواردة ووجّهها إلى الإدارات المعنية.",
    },
    {
      en: "Drafted letters, memoranda and internal circulars in Arabic and English.",
      ar: "صاغ الخطابات والمذكرات والتعاميم الداخلية بالعربية والإنجليزية.",
    },
    {
      en: "Maintained paper and electronic filing systems and controlled document retrieval.",
      ar: "حافظ على أنظمة الحفظ الورقية والإلكترونية وضبط استرجاع المستندات.",
    },
    {
      en: "Prepared meeting agendas, recorded the minutes and followed up action items.",
      ar: "أعدّ جداول أعمال الاجتماعات وحرّر محاضرها وتابع بنود الإجراءات.",
    },
    {
      en: "Received visitors and answered telephone enquiries.",
      ar: "استقبل الزوار وأجاب استفسارات الهاتف.",
    },
    {
      en: "Raised purchase requests for office supplies and followed up delivery.",
      ar: "رفع طلبات شراء اللوازم المكتبية وتابع تسليمها.",
    },
    {
      en: "Arranged travel, accommodation and visa paperwork for staff.",
      ar: "رتّب السفر والإقامة وإجراءات التأشيرات للعاملين.",
    },
    {
      en: "Prepared expense claims with their supporting documents for approval.",
      ar: "أعدّ مطالبات المصروفات ومستنداتها الداعمة للاعتماد.",
    },
    {
      en: "Supported new-employee onboarding paperwork with the human resources department.",
      ar: "ساند إجراءات مباشرة الموظفين الجدد مع إدارة الموارد البشرية.",
    },
    {
      en: "Maintained the confidentiality of the documents and information he handled.",
      ar: "حافظ على سرية المستندات والمعلومات التي تعامل معها.",
    },
  ],
  credentials: [
    { kind: "certification", title: { en: "Office Administration Certificate", ar: "شهادة الإدارة المكتبية" } },
    { kind: "certification", title: { en: "Microsoft Office Specialist", ar: "أخصائي مايكروسوفت أوفيس" } },
    { kind: "training", title: { en: "Business Correspondence Training", ar: "تدريب المراسلات الإدارية" } },
    { kind: "training", title: { en: "Records Management Training", ar: "تدريب إدارة السجلات" } },
    { kind: "training", title: { en: "Customer Service Training", ar: "تدريب خدمة العملاء" } },
  ],
  keywords: [
    "Administrative Assistant", "Office Administration", "Calendar Management",
    "Business Correspondence", "Minutes of Meetings", "Filing and Archiving",
    "Records Management", "Data Entry", "Microsoft Office", "Travel Arrangements",
    "Reception", "Confidentiality",
    "مساعد إداري", "الإدارة المكتبية", "المراسلات الإدارية", "محاضر الاجتماعات",
    "الأرشفة", "إدخال البيانات",
  ],
};

/*
 * The four packs below fill the widest gap `ops/verify-jobs.mjs`'s sibling audit found: every one
 * of these occupations already carries a `CredentialRule` in `countryRules.ts` — the product could
 * already tell a teacher, engineer, pharmacist or lawyer which licence exists for them — but had no
 * duties, skills or ATS keywords to offer alongside it, so anyone in these four professions fell
 * through to the generic, non-occupation-specific suggestion path. Credential titles and issuers
 * below are copied verbatim from the matching `CredentialRule` so the two files cannot drift apart
 * and say two different things about the same licence.
 */

const TEACHER: RolePack = {
  slug: "teacher",
  title: { en: "Teacher", ar: "معلم" },
  aliases: [
    "Teacher",
    "School Teacher",
    "Classroom Teacher",
    "Subject Teacher",
    "Mathematics Teacher",
    "Science Teacher",
    "English Teacher",
    "Arabic Teacher",
    "Primary School Teacher",
    "Secondary School Teacher",
    "معلم",
    "معلمة",
    "مدرس",
    "مدرسة",
    "معلم رياضيات",
    "معلم علوم",
    "معلم لغة إنجليزية",
    "معلم مرحلة ابتدائية",
    "معلم مرحلة متوسطة",
    "معلم مرحلة ثانوية",
  ],
  groups: [
    {
      label: { en: "Subjects & Curriculum", ar: "المواد والمنهج" },
      items: [
        { en: "Lesson planning", ar: "التخطيط للدروس" },
        { en: "Curriculum alignment", ar: "مواءمة المنهج الدراسي" },
        { en: "Differentiated instruction", ar: "التدريس المتمايز" },
        { en: "Subject-matter expertise", ar: "التمكن من المادة العلمية" },
        { en: "Cross-curricular integration", ar: "الدمج بين المواد الدراسية" },
      ],
    },
    {
      label: { en: "Classroom & Assessment", ar: "إدارة الصف والتقييم" },
      items: [
        { en: "Classroom management", ar: "إدارة الصف" },
        { en: "Formative assessment", ar: "التقييم التكويني" },
        { en: "Summative assessment", ar: "التقييم الختامي" },
        { en: "Individualized student support", ar: "الدعم الفردي للطلاب" },
        { en: "Behavior management", ar: "إدارة السلوك" },
        { en: "Parent communication", ar: "التواصل مع أولياء الأمور" },
      ],
    },
    {
      label: { en: "Systems & Tools", ar: "الأنظمة والأدوات" },
      items: [
        { en: "Learning management systems", ar: "أنظمة إدارة التعلم" },
        { en: "Digital curriculum platforms", ar: "منصات المناهج الرقمية" },
        { en: "Gradebook & attendance systems", ar: "أنظمة الدرجات والحضور" },
        { en: "Educational technology", ar: "تقنيات التعليم" },
        { en: "Remote & blended learning tools", ar: "أدوات التعلم عن بعد والمدمج" },
      ],
    },
  ],
  duties: [
    { en: "Planned and delivered lessons aligned with the approved curriculum and learning objectives.", ar: "خطط للدروس ونفذها بما يتوافق مع المنهج المعتمد والأهداف التعليمية." },
    { en: "Assessed student progress through formative and summative evaluation methods.", ar: "قيّم تقدم الطلاب من خلال أساليب التقييم التكويني والختامي." },
    { en: "Differentiated instruction to address a range of learning styles and abilities within the classroom.", ar: "نوّع أساليب التدريس لتلبية أنماط التعلم وقدرات الطلاب المختلفة داخل الصف." },
    { en: "Managed classroom behaviour and maintained a productive learning environment.", ar: "أدار سلوك الطلاب وحافظ على بيئة تعليمية منتجة." },
    { en: "Communicated student progress and concerns with parents and guardians.", ar: "تواصل مع أولياء الأمور بشأن تقدم الطلاب واهتماماتهم." },
    { en: "Prepared instructional materials, worksheets and assessments aligned with the curriculum.", ar: "أعدّ المواد التعليمية وأوراق العمل والاختبارات المتوافقة مع المنهج." },
    { en: "Integrated digital learning platforms and educational technology into daily instruction.", ar: "دمج منصات التعلم الرقمي والتقنيات التعليمية في التدريس اليومي." },
    { en: "Participated in curriculum planning meetings and professional development sessions.", ar: "شارك في اجتماعات التخطيط للمنهج وجلسات التطوير المهني." },
    { en: "Provided individualized support to students requiring additional academic assistance.", ar: "قدّم دعماً فردياً للطلاب المحتاجين لمساعدة أكاديمية إضافية." },
    { en: "Maintained accurate records of student attendance, grades and behavioural notes.", ar: "حافظ على سجلات دقيقة لحضور الطلاب ودرجاتهم وملاحظاتهم السلوكية." },
    { en: "Supervised students during school activities, examinations and extracurricular events.", ar: "أشرف على الطلاب خلال الأنشطة المدرسية والاختبارات والفعاليات اللاصفية." },
    { en: "Coordinated with fellow teachers and school leadership on student support plans.", ar: "نسّق مع زملائه المعلمين وإدارة المدرسة بشأن خطط دعم الطلاب." },
  ],
  credentials: [
    { kind: "licence", title: { en: "Professional Teaching Licence", ar: "الرخصة المهنية للمعلمين" }, issuer: "Education & Training Evaluation Commission (ETEC)" },
    { kind: "certification", title: { en: "Teaching Methodology Certificate", ar: "شهادة طرق التدريس" } },
    { kind: "training", title: { en: "Classroom Management Training", ar: "تدريب إدارة الصف" } },
    { kind: "training", title: { en: "First Aid & School Safety Training", ar: "تدريب الإسعافات الأولية والسلامة المدرسية" } },
  ],
  keywords: [
    "Teacher", "Lesson Planning", "Curriculum", "Classroom Management", "Formative Assessment",
    "Differentiated Instruction", "Learning Management System", "Student Engagement", "ETEC",
    "Professional Teaching Licence",
    "معلم", "التخطيط للدروس", "إدارة الصف", "التقييم التكويني", "الرخصة المهنية",
  ],
};

const CIVIL_ENGINEER: RolePack = {
  slug: "civil-engineer",
  title: { en: "Civil Engineer", ar: "مهندس مدني" },
  aliases: [
    "Civil Engineer",
    "Structural Engineer",
    "Site Engineer",
    "Civil Design Engineer",
    "Construction Engineer",
    "مهندس مدني",
    "مهندسة مدنية",
    "مهندس إنشائي",
    "مهندس موقع",
    "مهندس تصميم مدني",
  ],
  groups: [
    {
      label: { en: "Design & Analysis", ar: "التصميم والتحليل" },
      items: [
        { en: "Structural design", ar: "التصميم الإنشائي" },
        { en: "Site planning", ar: "تخطيط الموقع" },
        { en: "Quantity takeoff", ar: "حصر الكميات" },
        { en: "Drawing review", ar: "مراجعة المخططات" },
        { en: "Load calculations", ar: "حسابات الأحمال" },
      ],
    },
    {
      label: { en: "Software & Standards", ar: "البرمجيات والمعايير" },
      items: [
        { en: "AutoCAD", ar: "أوتوكاد" },
        { en: "Revit / BIM", ar: "ريفيت / نمذجة معلومات البناء" },
        { en: "Saudi Building Code", ar: "كود البناء السعودي" },
        { en: "Structural analysis software", ar: "برامج التحليل الإنشائي" },
        { en: "Contract documentation", ar: "وثائق العقود" },
      ],
    },
    {
      label: { en: "Site & Compliance", ar: "الموقع والامتثال" },
      items: [
        { en: "Site supervision", ar: "الإشراف على الموقع" },
        { en: "Safety compliance", ar: "الامتثال لمتطلبات السلامة" },
        { en: "Quality control", ar: "ضبط الجودة" },
        { en: "Contractor coordination", ar: "التنسيق مع المقاولين" },
        { en: "Progress reporting", ar: "تقارير سير العمل" },
      ],
    },
  ],
  duties: [
    { en: "Prepared structural designs and calculations in accordance with applicable building codes.", ar: "أعدّ التصاميم والحسابات الإنشائية وفق أكواد البناء المعتمدة." },
    { en: "Reviewed and approved construction drawings for compliance with design specifications.", ar: "راجع مخططات التنفيذ واعتمدها للتأكد من مطابقتها لمواصفات التصميم." },
    { en: "Supervised on-site construction activities to verify adherence to approved plans.", ar: "أشرف على أعمال التنفيذ في الموقع للتحقق من الالتزام بالمخططات المعتمدة." },
    { en: "Coordinated with architects, contractors and subcontractors throughout the project lifecycle.", ar: "نسّق مع المعماريين والمقاولين ومقاولي الباطن طوال مراحل المشروع." },
    { en: "Conducted quantity takeoffs and supported cost estimation for project phases.", ar: "أجرى حصر الكميات ودعم عمليات تقدير التكاليف لمراحل المشروع." },
    { en: "Monitored site safety practices and enforced compliance with applicable regulations.", ar: "راقب ممارسات السلامة في الموقع وفرض الالتزام بالأنظمة المعمول بها." },
    { en: "Prepared progress reports and communicated project status to stakeholders.", ar: "أعدّ تقارير سير العمل وأبلغ أصحاب المصلحة بحالة المشروع." },
    { en: "Reviewed material submittals and shop drawings against project specifications.", ar: "راجع طلبات اعتماد المواد ومخططات الورشة مقارنة بمواصفات المشروع." },
    { en: "Investigated site conditions and recommended engineering solutions to design or construction issues.", ar: "درس ظروف الموقع واقترح حلولاً هندسية لمشكلات التصميم أو التنفيذ." },
    { en: "Performed quality-control inspections on structural and civil works.", ar: "أجرى فحوصات ضبط الجودة على الأعمال الإنشائية والمدنية." },
    { en: "Maintained project documentation, including technical reports and correspondence.", ar: "حافظ على توثيق المشروع بما يشمل التقارير الفنية والمراسلات." },
    { en: "Coordinated permit and regulatory-approval submissions with relevant authorities.", ar: "نسّق تقديم طلبات التراخيص والموافقات النظامية مع الجهات المختصة." },
  ],
  credentials: [
    { kind: "registration", title: { en: "Saudi Council of Engineers Professional Accreditation", ar: "الاعتماد المهني — الهيئة السعودية للمهندسين" }, issuer: "Saudi Council of Engineers" },
    { kind: "certification", title: { en: "Project Management Certification", ar: "شهادة إدارة المشاريع" } },
    { kind: "training", title: { en: "Construction Safety Training", ar: "تدريب السلامة في مواقع الإنشاء" } },
    { kind: "certification", title: { en: "Computer-Aided Design (CAD) Certificate", ar: "شهادة التصميم بمساعدة الحاسوب" } },
  ],
  keywords: [
    "Civil Engineer", "Structural Design", "AutoCAD", "Revit", "BIM", "Site Supervision",
    "Saudi Building Code", "Quantity Takeoff", "Quality Control", "Saudi Council of Engineers",
    "مهندس مدني", "التصميم الإنشائي", "الإشراف على الموقع", "كود البناء السعودي",
  ],
};

const PHARMACIST: RolePack = {
  slug: "pharmacist",
  title: { en: "Pharmacist", ar: "صيدلي" },
  aliases: [
    "Pharmacist",
    "Clinical Pharmacist",
    "Hospital Pharmacist",
    "Community Pharmacist",
    "Retail Pharmacist",
    "صيدلي",
    "صيدلانية",
    "صيدلي إكلينيكي",
    "صيدلي مستشفى",
  ],
  groups: [
    {
      label: { en: "Clinical & Dispensing", ar: "الصرف والرعاية الإكلينيكية" },
      items: [
        { en: "Prescription review", ar: "مراجعة الوصفات الطبية" },
        { en: "Medication dispensing", ar: "صرف الأدوية" },
        { en: "Patient counseling", ar: "إرشاد المرضى" },
        { en: "Drug-interaction checking", ar: "فحص التداخلات الدوائية" },
        { en: "Dosage verification", ar: "التحقق من الجرعات" },
      ],
    },
    {
      label: { en: "Systems", ar: "الأنظمة" },
      items: [
        { en: "Pharmacy information systems", ar: "أنظمة معلومات الصيدلية" },
        { en: "Electronic prescribing", ar: "الوصفات الإلكترونية" },
        { en: "Inventory management systems", ar: "أنظمة إدارة المخزون" },
        { en: "Automated dispensing systems", ar: "أنظمة الصرف الآلي" },
      ],
    },
    {
      label: { en: "Compliance & Safety", ar: "الامتثال والسلامة" },
      items: [
        { en: "Controlled-substance handling", ar: "التعامل مع المواد الخاضعة للرقابة" },
        { en: "Storage-condition monitoring", ar: "مراقبة ظروف التخزين" },
        { en: "Adverse-event reporting", ar: "الإبلاغ عن الأحداث الدوائية الضارة" },
        { en: "Regulatory compliance", ar: "الامتثال التنظيمي" },
      ],
    },
  ],
  duties: [
    { en: "Reviewed prescriptions for accuracy, appropriateness and potential drug interactions before dispensing.", ar: "راجع الوصفات الطبية للتأكد من دقتها وملاءمتها واحتمالية وجود تداخلات دوائية قبل الصرف." },
    { en: "Dispensed medications in accordance with prescriber instructions and pharmacy protocols.", ar: "صرف الأدوية وفق تعليمات الطبيب المعالج وبروتوكولات الصيدلية." },
    { en: "Counseled patients on proper medication use, dosage and potential side effects.", ar: "أرشد المرضى حول الاستخدام الصحيح للأدوية والجرعات والآثار الجانبية المحتملة." },
    { en: "Monitored medication storage conditions to maintain product integrity and safety.", ar: "راقب ظروف تخزين الأدوية للحفاظ على سلامتها وفعاليتها." },
    { en: "Maintained accurate records of controlled substances in accordance with regulatory requirements.", ar: "حافظ على سجلات دقيقة للمواد الخاضعة للرقابة وفق المتطلبات النظامية." },
    { en: "Collaborated with physicians and healthcare staff on medication therapy management.", ar: "تعاون مع الأطباء والكادر الطبي في إدارة العلاج الدوائي." },
    { en: "Identified and reported adverse drug reactions and medication errors.", ar: "رصد الأعراض الدوائية الضارة وأخطاء الأدوية وأبلغ عنها." },
    { en: "Managed pharmacy inventory, including stock levels, expiry tracking and reordering.", ar: "أدار مخزون الصيدلية بما يشمل مستويات المخزون وتتبع تواريخ الصلاحية وإعادة الطلب." },
    { en: "Verified insurance and formulary coverage for prescribed medications.", ar: "تحقق من التغطية التأمينية وقوائم الأدوية المعتمدة للوصفات." },
    { en: "Ensured compliance with pharmacy regulations and health-authority standards.", ar: "ضمن الامتثال لأنظمة الصيدلة ومعايير الجهات الصحية." },
    { en: "Trained and supervised pharmacy technicians and support staff.", ar: "درّب فنيي الصيدلة والكادر المساند وأشرف عليهم." },
    { en: "Participated in medication-safety and quality-improvement initiatives.", ar: "شارك في مبادرات سلامة الأدوية وتحسين الجودة." },
  ],
  credentials: [
    { kind: "registration", title: { en: "SCFHS Professional Classification & Registration", ar: "التصنيف والتسجيل المهني — الهيئة السعودية للتخصصات الصحية" }, issuer: "SCFHS" },
    { kind: "certification", title: { en: "Basic Life Support (BLS)", ar: "دعم الحياة الأساسي" } },
    { kind: "training", title: { en: "Medication Safety Training", ar: "تدريب سلامة الأدوية" } },
    { kind: "training", title: { en: "Clinical Pharmacy Training", ar: "تدريب الصيدلة الإكلينيكية" } },
  ],
  keywords: [
    "Pharmacist", "Prescription Review", "Medication Dispensing", "Patient Counseling",
    "Drug Interactions", "Pharmacy Information System", "Controlled Substances", "SCFHS",
    "صيدلي", "صرف الأدوية", "إرشاد المرضى", "التصنيف والتسجيل المهني",
  ],
};

const LAWYER: RolePack = {
  slug: "lawyer",
  title: { en: "Lawyer", ar: "محامٍ" },
  aliases: [
    "Lawyer",
    "Attorney",
    "Legal Counsel",
    "Associate Lawyer",
    "Corporate Lawyer",
    "Litigation Lawyer",
    "محامٍ",
    "محامية",
    "مستشار قانوني",
    "محامي شركات",
  ],
  groups: [
    {
      label: { en: "Practice Areas", ar: "مجالات الممارسة" },
      items: [
        { en: "Contract drafting", ar: "صياغة العقود" },
        { en: "Corporate law", ar: "القانون التجاري" },
        { en: "Litigation", ar: "التقاضي" },
        { en: "Regulatory compliance", ar: "الامتثال التنظيمي" },
        { en: "Dispute resolution", ar: "تسوية النزاعات" },
      ],
    },
    {
      label: { en: "Legal Research & Drafting", ar: "البحث القانوني والصياغة" },
      items: [
        { en: "Legal research", ar: "البحث القانوني" },
        { en: "Legal memoranda", ar: "المذكرات القانونية" },
        { en: "Due diligence", ar: "الفحص النافي للجهالة" },
        { en: "Contract negotiation", ar: "التفاوض على العقود" },
      ],
    },
    {
      label: { en: "Systems & Processes", ar: "الأنظمة والإجراءات" },
      items: [
        { en: "Case management systems", ar: "أنظمة إدارة القضايا" },
        { en: "Electronic court filing", ar: "التقاضي الإلكتروني" },
        { en: "Document review platforms", ar: "منصات مراجعة المستندات" },
        { en: "Legal research databases", ar: "قواعد بيانات البحث القانوني" },
      ],
    },
  ],
  duties: [
    { en: "Drafted, reviewed and negotiated commercial contracts on behalf of clients.", ar: "صاغ العقود التجارية وراجعها وتفاوض بشأنها نيابة عن العملاء." },
    { en: "Conducted legal research to support case strategy and client advice.", ar: "أجرى أبحاثاً قانونية لدعم استراتيجية القضايا وتقديم المشورة للعملاء." },
    { en: "Represented clients in negotiations, hearings and dispute-resolution proceedings.", ar: "مثّل العملاء في المفاوضات والجلسات وإجراءات تسوية النزاعات." },
    { en: "Prepared legal memoranda and opinions on matters of corporate and regulatory law.", ar: "أعدّ المذكرات والآراء القانونية في مسائل القانون التجاري والتنظيمي." },
    { en: "Reviewed corporate documents and conducted due diligence for transactions.", ar: "راجع المستندات التجارية وأجرى الفحص النافي للجهالة للصفقات." },
    { en: "Advised clients on compliance with applicable laws and regulations.", ar: "قدّم المشورة للعملاء بشأن الامتثال للأنظمة والقوانين المعمول بها." },
    { en: "Managed case files and coordinated filings through the electronic court system.", ar: "أدار ملفات القضايا ونسّق تقديم المرافعات عبر نظام التقاضي الإلكتروني." },
    { en: "Liaised with courts, government authorities and opposing counsel on case matters.", ar: "تواصل مع المحاكم والجهات الحكومية والأطراف المقابلة بشأن القضايا." },
    { en: "Drafted pleadings, motions and other litigation documents.", ar: "صاغ اللوائح والمذكرات وغيرها من مستندات التقاضي." },
    { en: "Advised on contract disputes and recommended risk-mitigation strategies.", ar: "قدّم المشورة بشأن النزاعات التعاقدية واقترح استراتيجيات لتخفيف المخاطر." },
    { en: "Maintained client confidentiality and adhered to professional conduct standards.", ar: "حافظ على سرية معلومات العملاء والتزم بمعايير السلوك المهني." },
    { en: "Coordinated with external counsel and cross-border legal teams on multi-jurisdictional matters.", ar: "نسّق مع مستشارين قانونيين خارجيين وفرق قانونية عابرة للحدود في القضايا متعددة الاختصاصات." },
  ],
  credentials: [
    { kind: "licence", title: { en: "Practising Licence — Saudi Bar Association", ar: "ترخيص المحاماة — الهيئة السعودية للمحامين" }, issuer: "Saudi Bar Association" },
    { kind: "membership", title: { en: "Bar Association Membership", ar: "عضوية الهيئة السعودية للمحامين" } },
    { kind: "training", title: { en: "Commercial Arbitration Training", ar: "تدريب التحكيم التجاري" } },
    { kind: "certification", title: { en: "Legal Drafting Certificate", ar: "شهادة الصياغة القانونية" } },
  ],
  keywords: [
    "Lawyer", "Attorney", "Legal Counsel", "Contract Drafting", "Litigation", "Due Diligence",
    "Legal Research", "Saudi Bar Association",
    "محامٍ", "صياغة العقود", "التقاضي", "ترخيص المحاماة",
  ],
};

const ROLE_PACKS: RolePack[] = [
  RADIOLOGY_TECHNOLOGIST,
  ACCOUNTANT,
  CASHIER,
  REGISTERED_NURSE,
  SALES_MANAGER,
  ADMINISTRATIVE_ASSISTANT,
  TEACHER,
  CIVIL_ENGINEER,
  PHARMACIST,
  LAWYER,
];

/** A copy, so a caller sorting for display cannot reorder the packs for everyone. */
export function allRolePacks(): RolePack[] {
  return [...ROLE_PACKS];
}

/* ─────────────────────── matching ─────────────────────── */

/**
 * Below this a fuzzy match is noise: two characters of Arabic or English will
 * prefix half the aliases here, and a wrong pack is worse than no pack.
 */
const MIN_FUZZY_CHARS = 3;

interface Candidate {
  norm: string;
  tokens: string[];
  pack: RolePack;
}

let INDEX: Candidate[] | null = null;

function index(): Candidate[] {
  if (INDEX) return INDEX;
  const out: Candidate[] = [];
  for (const pack of ROLE_PACKS) {
    // Titles are matchable too, not just aliases — a user who types the exact
    // display title should not depend on someone having duplicated it below.
    for (const label of [pack.title.en, pack.title.ar, ...pack.aliases]) {
      const norm = normalizeLabel(label);
      if (!norm) continue;
      out.push({ norm, tokens: norm.split(" "), pack });
    }
  }
  INDEX = out;
  return out;
}

/**
 * Is the query an unfinished spelling of the candidate? "radiology tech" is what
 * people actually type, and it must reach "Radiology Technologist" before they
 * finish the word — so the query's tokens may be prefixes, aligned anywhere in
 * the candidate ("manager" finds "Sales Manager").
 */
function prefixAligns(query: string[], cand: string[]): boolean {
  for (let off = 0; off + query.length <= cand.length; off++) {
    let all = true;
    for (let i = 0; i < query.length; i++) {
      if (!cand[off + i].startsWith(query[i])) { all = false; break; }
    }
    if (all) return true;
  }
  return false;
}

/**
 * Does the candidate sit inside a longer query as whole words? "Senior
 * Accountant — Riyadh Branch" contains "accountant". Whole words only: matching
 * on characters lets "nurse" claim "nursery supervisor".
 */
function containsRun(query: string[], cand: string[]): boolean {
  for (let off = 0; off + cand.length <= query.length; off++) {
    let all = true;
    for (let i = 0; i < cand.length; i++) {
      if (query[off + i] !== cand[i]) { all = false; break; }
    }
    if (all) return true;
  }
  return false;
}

/**
 * The pack for a job title, or null.
 *
 * Null is a real answer. Someone typing an occupation not covered here gets the
 * generic path, which is honest; handing them the nearest pack would put another
 * profession's duties in front of them and invite one to be confirmed by
 * accident.
 */
export function findRolePack(title: string): RolePack | null {
  const norm = normalizeLabel(title);
  if (!norm) return null;
  const query = norm.split(" ").filter(Boolean);
  if (!query.length) return null;

  let best: RolePack | null = null;
  let bestScore = 0;

  for (const cand of index()) {
    let score = 0;
    if (cand.norm === norm) {
      // An exact title or alias hit always wins, however long the label.
      score = 1000 + cand.tokens.length;
    } else if (norm.length >= MIN_FUZZY_CHARS && query.length <= cand.tokens.length
      && prefixAligns(query, cand.tokens)) {
      // More query words matched is a stronger signal; extra unmatched words in
      // the candidate weaken it, so "sales" prefers "Sales Manager" over
      // "Regional Sales Manager".
      score = 500 + query.length * 10 - (cand.tokens.length - query.length);
    } else if (cand.norm.length >= MIN_FUZZY_CHARS && cand.tokens.length < query.length
      && containsRun(query, cand.tokens)) {
      score = 300 + cand.tokens.length * 10;
    }
    if (score > bestScore) {
      bestScore = score;
      best = cand.pack;
    }
  }
  return best;
}
