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

const ROLE_PACKS: RolePack[] = [
  RADIOLOGY_TECHNOLOGIST,
  ACCOUNTANT,
  CASHIER,
  REGISTERED_NURSE,
  SALES_MANAGER,
  ADMINISTRATIVE_ASSISTANT,
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
