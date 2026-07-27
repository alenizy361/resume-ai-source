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

/*
 * The next four complete the SCFHS credential rule's own occupation list: `sa-scfhs-registration`
 * already named physician, dentist, physiotherapist and laboratory technologist alongside
 * radiographer/nurse/pharmacist, but only the latter three had a pack until now.
 */

const PHYSICIAN: RolePack = {
  slug: "physician",
  title: { en: "Physician", ar: "طبيب" },
  aliases: [
    "Physician",
    "General Practitioner",
    "Medical Doctor",
    "Attending Physician",
    "Resident Physician",
    "طبيب",
    "طبيبة",
    "طبيب عام",
    "طبيب مقيم",
  ],
  groups: [
    {
      label: { en: "Clinical Practice", ar: "الممارسة الإكلينيكية" },
      items: [
        { en: "Patient examination", ar: "فحص المرضى" },
        { en: "Diagnosis", ar: "التشخيص" },
        { en: "Treatment planning", ar: "وضع الخطة العلاجية" },
        { en: "Prescribing medication", ar: "وصف الأدوية" },
        { en: "Patient counseling", ar: "إرشاد المرضى" },
      ],
    },
    {
      label: { en: "Systems", ar: "الأنظمة" },
      items: [
        { en: "Electronic medical records", ar: "السجلات الطبية الإلكترونية" },
        { en: "Clinical decision support systems", ar: "أنظمة دعم القرار الإكلينيكي" },
        { en: "Order entry systems", ar: "أنظمة إدخال الطلبات الطبية" },
        { en: "Telemedicine platforms", ar: "منصات الطب عن بعد" },
      ],
    },
    {
      label: { en: "Safety & Compliance", ar: "السلامة والامتثال" },
      items: [
        { en: "Infection control", ar: "مكافحة العدوى" },
        { en: "Patient safety protocols", ar: "بروتوكولات سلامة المرضى" },
        { en: "Clinical documentation", ar: "التوثيق الإكلينيكي" },
        { en: "Case referral", ar: "إحالة الحالات" },
      ],
    },
  ],
  duties: [
    { en: "Examined patients and took detailed medical histories to inform diagnosis.", ar: "فحص المرضى وأخذ التاريخ المرضي التفصيلي للمساعدة في التشخيص." },
    { en: "Diagnosed medical conditions based on clinical findings and diagnostic tests.", ar: "شخّص الحالات الطبية بناءً على النتائج الإكلينيكية والفحوصات التشخيصية." },
    { en: "Developed and adjusted treatment plans in coordination with the care team.", ar: "وضع خططاً علاجية وعدّلها بالتنسيق مع الفريق الطبي." },
    { en: "Prescribed medications in accordance with clinical guidelines and patient history.", ar: "وصف الأدوية وفق الإرشادات الإكلينيكية والتاريخ المرضي للمريض." },
    { en: "Documented patient encounters accurately in the electronic medical record.", ar: "وثّق زيارات المرضى بدقة في السجل الطبي الإلكتروني." },
    { en: "Referred patients to specialists when a case required care outside the physician's scope.", ar: "أحال المرضى إلى الأخصائيين عندما تطلبت الحالة رعاية تتجاوز نطاق الطبيب العام." },
    { en: "Counseled patients and families on diagnosis, treatment options and preventive care.", ar: "أرشد المرضى وأسرهم حول التشخيص وخيارات العلاج والرعاية الوقائية." },
    { en: "Collaborated with nurses, pharmacists and allied health staff on patient care.", ar: "تعاون مع الممرضين والصيادلة والكادر الطبي المساند في رعاية المرضى." },
    { en: "Followed infection-control and patient-safety protocols in all clinical settings.", ar: "التزم ببروتوكولات مكافحة العدوى وسلامة المرضى في جميع البيئات الإكلينيكية." },
    { en: "Participated in case discussions and clinical rounds.", ar: "شارك في مناقشات الحالات والجولات الإكلينيكية." },
    { en: "Ordered and interpreted diagnostic tests to support clinical decision-making.", ar: "طلب الفحوصات التشخيصية وفسّر نتائجها لدعم اتخاذ القرار الإكلينيكي." },
    { en: "Maintained continuing medical education to stay current with clinical practice.", ar: "واصل التعليم الطبي المستمر لمواكبة تطورات الممارسة الإكلينيكية." },
  ],
  credentials: [
    { kind: "registration", title: { en: "SCFHS Professional Classification & Registration", ar: "التصنيف والتسجيل المهني — الهيئة السعودية للتخصصات الصحية" }, issuer: "SCFHS" },
    { kind: "certification", title: { en: "Basic Life Support (BLS)", ar: "دعم الحياة الأساسي" } },
    { kind: "certification", title: { en: "Advanced Cardiac Life Support (ACLS)", ar: "الدعم المتقدم لحياة القلب" } },
    { kind: "training", title: { en: "Infection Control Training", ar: "تدريب مكافحة العدوى" } },
  ],
  keywords: [
    "Physician", "Diagnosis", "Treatment Planning", "Patient Care", "Electronic Medical Records",
    "Clinical Documentation", "SCFHS",
    "طبيب", "التشخيص", "الخطة العلاجية", "التصنيف والتسجيل المهني",
  ],
};

const DENTIST: RolePack = {
  slug: "dentist",
  title: { en: "Dentist", ar: "طبيب أسنان" },
  aliases: [
    "Dentist",
    "General Dentist",
    "Dental Practitioner",
    "Dental Surgeon",
    "طبيب أسنان",
    "طبيبة أسنان",
    "جراح أسنان",
  ],
  groups: [
    {
      label: { en: "Clinical Procedures", ar: "الإجراءات الإكلينيكية" },
      items: [
        { en: "Oral examination", ar: "فحص الفم" },
        { en: "Restorative dentistry", ar: "طب الأسنان الترميمي" },
        { en: "Extractions", ar: "خلع الأسنان" },
        { en: "Preventive care", ar: "الرعاية الوقائية" },
        { en: "Treatment planning", ar: "وضع الخطة العلاجية" },
      ],
    },
    {
      label: { en: "Systems", ar: "الأنظمة" },
      items: [
        { en: "Dental practice management software", ar: "برمجيات إدارة عيادات الأسنان" },
        { en: "Digital radiography", ar: "التصوير الشعاعي الرقمي" },
        { en: "Electronic patient records", ar: "السجلات الإلكترونية للمرضى" },
        { en: "Intraoral scanning", ar: "المسح الضوئي داخل الفم" },
      ],
    },
    {
      label: { en: "Safety & Compliance", ar: "السلامة والامتثال" },
      items: [
        { en: "Infection control", ar: "مكافحة العدوى" },
        { en: "Sterilization protocols", ar: "بروتوكولات التعقيم" },
        { en: "Patient safety", ar: "سلامة المرضى" },
        { en: "Radiation safety", ar: "السلامة الإشعاعية" },
      ],
    },
  ],
  duties: [
    { en: "Examined patients' oral health and diagnosed dental conditions.", ar: "فحص الصحة الفموية للمرضى وشخّص الحالات السنية." },
    { en: "Performed restorative procedures, including fillings and crowns.", ar: "أجرى إجراءات ترميمية شملت الحشوات والتيجان." },
    { en: "Extracted teeth when clinically indicated, following approved protocols.", ar: "خلع الأسنان عند الحاجة السريرية وفق البروتوكولات المعتمدة." },
    { en: "Developed treatment plans based on clinical and radiographic findings.", ar: "وضع خطط علاجية بناءً على النتائج الإكلينيكية والشعاعية." },
    { en: "Provided preventive care and oral hygiene education to patients.", ar: "قدّم الرعاية الوقائية وثقّف المرضى حول نظافة الفم." },
    { en: "Interpreted dental radiographs to support diagnosis and treatment.", ar: "فسّر الأشعة السنية لدعم التشخيص والعلاج." },
    { en: "Maintained sterilization and infection-control standards in the clinic.", ar: "حافظ على معايير التعقيم ومكافحة العدوى في العيادة." },
    { en: "Documented patient treatment accurately in the practice management system.", ar: "وثّق علاج المرضى بدقة في نظام إدارة العيادة." },
    { en: "Referred patients to specialists for procedures beyond general practice.", ar: "أحال المرضى إلى الأخصائيين للإجراءات التي تتجاوز نطاق طب الأسنان العام." },
    { en: "Coordinated with dental assistants and hygienists during procedures.", ar: "نسّق مع مساعدي ومختصي صحة الأسنان أثناء الإجراءات." },
    { en: "Managed patient anxiety and comfort during dental procedures.", ar: "تعامل مع قلق المرضى وراحتهم أثناء الإجراءات السنية." },
    { en: "Advised patients on treatment options, costs and expected outcomes.", ar: "قدّم المشورة للمرضى حول خيارات العلاج وتكاليفه ونتائجه المتوقعة." },
  ],
  credentials: [
    { kind: "registration", title: { en: "SCFHS Professional Classification & Registration", ar: "التصنيف والتسجيل المهني — الهيئة السعودية للتخصصات الصحية" }, issuer: "SCFHS" },
    { kind: "certification", title: { en: "Basic Life Support (BLS)", ar: "دعم الحياة الأساسي" } },
    { kind: "training", title: { en: "Infection Control Training", ar: "تدريب مكافحة العدوى" } },
    { kind: "training", title: { en: "Radiation Safety Training", ar: "تدريب السلامة الإشعاعية" } },
  ],
  keywords: [
    "Dentist", "Restorative Dentistry", "Oral Examination", "Dental Radiography", "Infection Control",
    "SCFHS",
    "طبيب أسنان", "طب الأسنان الترميمي", "مكافحة العدوى", "التصنيف والتسجيل المهني",
  ],
};

const PHYSIOTHERAPIST: RolePack = {
  slug: "physiotherapist",
  title: { en: "Physiotherapist", ar: "أخصائي علاج طبيعي" },
  aliases: [
    "Physiotherapist",
    "Physical Therapist",
    "Rehabilitation Therapist",
    "أخصائي علاج طبيعي",
    "أخصائية علاج طبيعي",
    "معالج طبيعي",
  ],
  groups: [
    {
      label: { en: "Assessment & Treatment", ar: "التقييم والعلاج" },
      items: [
        { en: "Patient assessment", ar: "تقييم المرضى" },
        { en: "Manual therapy", ar: "العلاج اليدوي" },
        { en: "Therapeutic exercise", ar: "التمارين العلاجية" },
        { en: "Mobility training", ar: "تدريب الحركة" },
        { en: "Post-operative rehabilitation", ar: "إعادة التأهيل بعد العمليات" },
      ],
    },
    {
      label: { en: "Modalities", ar: "الوسائل العلاجية" },
      items: [
        { en: "Electrotherapy", ar: "العلاج الكهربائي" },
        { en: "Hydrotherapy", ar: "العلاج المائي" },
        { en: "Heat and cold therapy", ar: "العلاج بالحرارة والبرودة" },
        { en: "Ultrasound therapy", ar: "العلاج بالموجات فوق الصوتية" },
      ],
    },
    {
      label: { en: "Systems & Safety", ar: "الأنظمة والسلامة" },
      items: [
        { en: "Electronic patient records", ar: "السجلات الإلكترونية للمرضى" },
        { en: "Progress tracking systems", ar: "أنظمة تتبع التقدم العلاجي" },
        { en: "Patient safety protocols", ar: "بروتوكولات سلامة المرضى" },
        { en: "Infection control", ar: "مكافحة العدوى" },
      ],
    },
  ],
  duties: [
    { en: "Assessed patients' physical function and mobility to develop treatment plans.", ar: "قيّم الوظيفة الجسدية والحركة للمرضى لوضع خطط العلاج." },
    { en: "Delivered manual therapy and therapeutic exercise programs.", ar: "قدّم العلاج اليدوي وبرامج التمارين العلاجية." },
    { en: "Guided patients through post-operative and post-injury rehabilitation.", ar: "وجّه المرضى خلال إعادة التأهيل بعد العمليات والإصابات." },
    { en: "Applied electrotherapy, hydrotherapy and other modalities as clinically indicated.", ar: "طبّق العلاج الكهربائي والمائي ووسائل أخرى حسب الحاجة السريرية." },
    { en: "Monitored and documented patient progress against treatment goals.", ar: "راقب ووثّق تقدم المرضى مقارنة بأهداف العلاج." },
    { en: "Educated patients and families on home exercise programs and injury prevention.", ar: "ثقّف المرضى وأسرهم حول برامج التمارين المنزلية والوقاية من الإصابات." },
    { en: "Adjusted treatment plans based on patient response and progress.", ar: "عدّل خطط العلاج بناءً على استجابة المريض وتقدمه." },
    { en: "Coordinated with physicians and other allied health staff on patient care.", ar: "نسّق مع الأطباء والكادر الطبي المساند في رعاية المرضى." },
    { en: "Maintained accurate clinical documentation in the patient record.", ar: "حافظ على توثيق إكلينيكي دقيق في سجل المريض." },
    { en: "Followed infection-control and patient-safety protocols during sessions.", ar: "التزم ببروتوكولات مكافحة العدوى وسلامة المرضى خلال الجلسات." },
    { en: "Assessed and fitted patients for mobility aids and assistive devices.", ar: "قيّم المرضى وجهّزهم بأدوات الحركة والمساعدة." },
    { en: "Participated in multidisciplinary case conferences.", ar: "شارك في اجتماعات الحالات متعددة التخصصات." },
  ],
  credentials: [
    { kind: "registration", title: { en: "SCFHS Professional Classification & Registration", ar: "التصنيف والتسجيل المهني — الهيئة السعودية للتخصصات الصحية" }, issuer: "SCFHS" },
    { kind: "certification", title: { en: "Basic Life Support (BLS)", ar: "دعم الحياة الأساسي" } },
    { kind: "training", title: { en: "Manual Therapy Training", ar: "تدريب العلاج اليدوي" } },
    { kind: "training", title: { en: "Infection Control Training", ar: "تدريب مكافحة العدوى" } },
  ],
  keywords: [
    "Physiotherapist", "Physical Therapy", "Rehabilitation", "Manual Therapy", "Therapeutic Exercise",
    "SCFHS",
    "أخصائي علاج طبيعي", "إعادة التأهيل", "العلاج اليدوي", "التصنيف والتسجيل المهني",
  ],
};

const LABORATORY_TECHNOLOGIST: RolePack = {
  slug: "laboratory-technologist",
  title: { en: "Laboratory Technologist", ar: "فني مختبر" },
  aliases: [
    "Laboratory Technologist",
    "Medical Laboratory Technologist",
    "Lab Technician",
    "Clinical Laboratory Scientist",
    "فني مختبر",
    "فنية مختبر",
    "أخصائي مختبر طبي",
    "محلل مختبر",
  ],
  groups: [
    {
      label: { en: "Testing & Analysis", ar: "الفحص والتحليل" },
      items: [
        { en: "Specimen collection", ar: "جمع العينات" },
        { en: "Sample processing", ar: "معالجة العينات" },
        { en: "Hematology testing", ar: "فحوصات أمراض الدم" },
        { en: "Microbiology testing", ar: "الفحوصات الميكروبيولوجية" },
        { en: "Biochemistry testing", ar: "الفحوصات الكيميائية الحيوية" },
      ],
    },
    {
      label: { en: "Systems", ar: "الأنظمة" },
      items: [
        { en: "Laboratory information systems", ar: "أنظمة معلومات المختبر" },
        { en: "Automated analyzers", ar: "أجهزة التحليل الآلي" },
        { en: "Quality control software", ar: "برمجيات ضبط الجودة" },
        { en: "Barcode specimen tracking", ar: "تتبع العينات بالباركود" },
      ],
    },
    {
      label: { en: "Quality & Safety", ar: "الجودة والسلامة" },
      items: [
        { en: "Quality control", ar: "ضبط الجودة" },
        { en: "Calibration", ar: "معايرة الأجهزة" },
        { en: "Biosafety protocols", ar: "بروتوكولات السلامة الحيوية" },
        { en: "Result verification", ar: "التحقق من النتائج" },
      ],
    },
  ],
  duties: [
    { en: "Collected and processed patient specimens according to laboratory protocols.", ar: "جمع عينات المرضى وعالجها وفق بروتوكولات المختبر." },
    { en: "Performed hematology, biochemistry and microbiology testing on patient samples.", ar: "أجرى فحوصات أمراض الدم والكيمياء الحيوية والميكروبيولوجيا على عينات المرضى." },
    { en: "Operated and maintained automated laboratory analyzers.", ar: "شغّل أجهزة التحليل المختبري الآلية وصانها." },
    { en: "Verified test results for accuracy before release to the requesting physician.", ar: "تحقق من دقة نتائج الفحوصات قبل إرسالها للطبيب الطالب." },
    { en: "Performed quality-control checks and calibration on laboratory equipment.", ar: "أجرى فحوصات ضبط الجودة ومعايرة أجهزة المختبر." },
    { en: "Documented test results and specimen data in the laboratory information system.", ar: "وثّق نتائج الفحوصات وبيانات العينات في نظام معلومات المختبر." },
    { en: "Followed biosafety and infection-control protocols when handling specimens.", ar: "التزم ببروتوكولات السلامة الحيوية ومكافحة العدوى عند التعامل مع العينات." },
    { en: "Escalated critical or abnormal results to clinical staff promptly.", ar: "صعّد النتائج الحرجة أو غير الطبيعية للكادر الطبي فوراً." },
    { en: "Maintained inventory of laboratory reagents and supplies.", ar: "حافظ على مخزون كواشف ومستلزمات المختبر." },
    { en: "Troubleshot equipment malfunctions and coordinated repairs with biomedical engineering.", ar: "شخّص أعطال الأجهزة ونسّق إصلاحها مع الهندسة الطبية." },
    { en: "Participated in proficiency testing and laboratory accreditation activities.", ar: "شارك في اختبارات الكفاءة وأنشطة اعتماد المختبر." },
    { en: "Trained new staff on laboratory procedures and safety protocols.", ar: "درّب الموظفين الجدد على إجراءات المختبر وبروتوكولات السلامة." },
  ],
  credentials: [
    { kind: "registration", title: { en: "SCFHS Professional Classification & Registration", ar: "التصنيف والتسجيل المهني — الهيئة السعودية للتخصصات الصحية" }, issuer: "SCFHS" },
    { kind: "certification", title: { en: "Basic Life Support (BLS)", ar: "دعم الحياة الأساسي" } },
    { kind: "training", title: { en: "Biosafety Training", ar: "تدريب السلامة الحيوية" } },
    { kind: "training", title: { en: "Laboratory Quality Control Training", ar: "تدريب ضبط الجودة المخبرية" } },
  ],
  keywords: [
    "Laboratory Technologist", "Specimen Collection", "Hematology", "Microbiology", "Biochemistry",
    "Quality Control", "SCFHS",
    "فني مختبر", "الفحوصات الميكروبيولوجية", "ضبط الجودة", "التصنيف والتسجيل المهني",
  ],
};

/*
 * The eleven below round out the rest of `occupations.ts`'s 29-occupation taxonomy: the remaining
 * engineering disciplines, the finance occupation that shares SOCPA with accountant but is a
 * distinct role, and the IT/admin/sales families, which had no pack of any kind before this. None
 * of the IT/admin/sales credentials are Saudi government licences — there is no such requirement
 * for these roles — so they list widely recognized professional certifications instead, the same
 * category `CASHIER`/`ADMINISTRATIVE_ASSISTANT`/`SALES_MANAGER` already use.
 */

const MECHANICAL_ENGINEER: RolePack = {
  slug: "mechanical-engineer",
  title: { en: "Mechanical Engineer", ar: "مهندس ميكانيكي" },
  aliases: [
    "Mechanical Engineer", "Design Engineer", "HVAC Engineer", "Maintenance Engineer",
    "مهندس ميكانيكي", "مهندسة ميكانيكية", "مهندس تصميم ميكانيكي", "مهندس صيانة",
  ],
  groups: [
    {
      label: { en: "Design & Analysis", ar: "التصميم والتحليل" },
      items: [
        { en: "Mechanical design", ar: "التصميم الميكانيكي" },
        { en: "Thermal analysis", ar: "التحليل الحراري" },
        { en: "Stress analysis", ar: "تحليل الإجهادات" },
        { en: "HVAC systems", ar: "أنظمة التكييف والتهوية" },
      ],
    },
    {
      label: { en: "Software & Standards", ar: "البرمجيات والمعايير" },
      items: [
        { en: "AutoCAD", ar: "أوتوكاد" },
        { en: "SolidWorks", ar: "سوليدوركس" },
        { en: "Finite element analysis", ar: "التحليل بالعناصر المحددة" },
        { en: "ASME / ISO standards", ar: "معايير ASME وISO" },
      ],
    },
    {
      label: { en: "Maintenance & Operations", ar: "الصيانة والتشغيل" },
      items: [
        { en: "Preventive maintenance", ar: "الصيانة الوقائية" },
        { en: "Equipment troubleshooting", ar: "تشخيص أعطال المعدات" },
        { en: "Project coordination", ar: "تنسيق المشاريع" },
        { en: "Safety compliance", ar: "الامتثال لمتطلبات السلامة" },
      ],
    },
  ],
  duties: [
    { en: "Designed mechanical components and systems in accordance with applicable engineering standards.", ar: "صمّم مكونات وأنظمة ميكانيكية وفق المعايير الهندسية المعتمدة." },
    { en: "Performed thermal and stress analysis to verify component performance and safety margins.", ar: "أجرى التحليل الحراري وتحليل الإجهادات للتحقق من أداء المكونات وهوامش الأمان." },
    { en: "Reviewed and approved mechanical drawings for compliance with design specifications.", ar: "راجع المخططات الميكانيكية واعتمدها للتأكد من مطابقتها لمواصفات التصميم." },
    { en: "Coordinated with HVAC contractors on system installation and commissioning.", ar: "نسّق مع مقاولي التكييف والتهوية بشأن تركيب الأنظمة وتشغيلها." },
    { en: "Conducted preventive maintenance planning to reduce equipment downtime.", ar: "خطط للصيانة الوقائية لتقليل توقف المعدات عن العمل." },
    { en: "Diagnosed and resolved mechanical equipment faults.", ar: "شخّص أعطال المعدات الميكانيكية وأصلحها." },
    { en: "Prepared technical specifications and bills of materials for mechanical projects.", ar: "أعدّ المواصفات الفنية وقوائم المواد للمشاريع الميكانيكية." },
    { en: "Monitored site installation activities to verify adherence to approved designs.", ar: "راقب أعمال التركيب في الموقع للتحقق من الالتزام بالتصاميم المعتمدة." },
    { en: "Performed finite element analysis to validate component and assembly designs.", ar: "أجرى التحليل بالعناصر المحددة للتحقق من تصاميم المكونات والتجميعات." },
    { en: "Ensured compliance with applicable engineering codes and safety regulations.", ar: "ضمن الامتثال للأكواد الهندسية وأنظمة السلامة المعمول بها." },
    { en: "Collaborated with cross-functional teams on project design and delivery.", ar: "تعاون مع فرق متعددة التخصصات في تصميم المشاريع وتسليمها." },
    { en: "Prepared engineering reports and documentation for project milestones.", ar: "أعدّ التقارير الهندسية والتوثيق لمراحل المشروع." },
  ],
  credentials: [
    { kind: "registration", title: { en: "Saudi Council of Engineers Professional Accreditation", ar: "الاعتماد المهني — الهيئة السعودية للمهندسين" }, issuer: "Saudi Council of Engineers" },
    { kind: "certification", title: { en: "Project Management Certification", ar: "شهادة إدارة المشاريع" } },
    { kind: "training", title: { en: "HVAC Systems Training", ar: "تدريب أنظمة التكييف والتهوية" } },
    { kind: "certification", title: { en: "Computer-Aided Design (CAD) Certificate", ar: "شهادة التصميم بمساعدة الحاسوب" } },
  ],
  keywords: [
    "Mechanical Engineer", "Mechanical Design", "HVAC", "Thermal Analysis", "SolidWorks", "AutoCAD",
    "Finite Element Analysis", "Saudi Council of Engineers",
    "مهندس ميكانيكي", "التصميم الميكانيكي", "التكييف والتهوية", "الاعتماد المهني",
  ],
};

const ELECTRICAL_ENGINEER: RolePack = {
  slug: "electrical-engineer",
  title: { en: "Electrical Engineer", ar: "مهندس كهربائي" },
  aliases: [
    "Electrical Engineer", "Power Systems Engineer", "Electrical Design Engineer", "Instrumentation Engineer",
    "مهندس كهربائي", "مهندسة كهربائية", "مهندس أنظمة القدرة", "مهندس تصميم كهربائي",
  ],
  groups: [
    {
      label: { en: "Design & Analysis", ar: "التصميم والتحليل" },
      items: [
        { en: "Electrical system design", ar: "تصميم الأنظمة الكهربائية" },
        { en: "Power distribution", ar: "توزيع الطاقة" },
        { en: "Load calculations", ar: "حسابات الأحمال" },
        { en: "Circuit design", ar: "تصميم الدوائر الكهربائية" },
      ],
    },
    {
      label: { en: "Software & Standards", ar: "البرمجيات والمعايير" },
      items: [
        { en: "AutoCAD Electrical", ar: "أوتوكاد للكهرباء" },
        { en: "ETAP", ar: "إيتاب" },
        { en: "Saudi Electricity standards", ar: "معايير الكهرباء السعودية" },
        { en: "PLC programming", ar: "برمجة وحدات التحكم المنطقي" },
      ],
    },
    {
      label: { en: "Testing & Maintenance", ar: "الفحص والصيانة" },
      items: [
        { en: "System testing", ar: "فحص الأنظمة" },
        { en: "Preventive maintenance", ar: "الصيانة الوقائية" },
        { en: "Fault diagnosis", ar: "تشخيص الأعطال" },
        { en: "Safety compliance", ar: "الامتثال لمتطلبات السلامة" },
      ],
    },
  ],
  duties: [
    { en: "Designed electrical distribution systems in accordance with applicable codes and standards.", ar: "صمّم أنظمة توزيع كهربائية وفق الأكواد والمعايير المعتمدة." },
    { en: "Performed load calculations to size electrical panels and distribution equipment.", ar: "أجرى حسابات الأحمال لتحديد سعة اللوحات الكهربائية ومعدات التوزيع." },
    { en: "Reviewed and approved electrical drawings for compliance with project specifications.", ar: "راجع المخططات الكهربائية واعتمدها للتأكد من مطابقتها لمواصفات المشروع." },
    { en: "Programmed and configured PLC systems for industrial automation.", ar: "برمج وضبط أنظمة التحكم المنطقي للأتمتة الصناعية." },
    { en: "Conducted system testing and commissioning of electrical installations.", ar: "أجرى فحص وتشغيل التركيبات الكهربائية." },
    { en: "Diagnosed and resolved electrical faults in equipment and systems.", ar: "شخّص الأعطال الكهربائية في الأجهزة والأنظمة وأصلحها." },
    { en: "Coordinated with contractors on electrical installation and commissioning.", ar: "نسّق مع المقاولين بشأن تركيب الأنظمة الكهربائية وتشغيلها." },
    { en: "Monitored preventive maintenance programs to reduce equipment downtime.", ar: "راقب برامج الصيانة الوقائية لتقليل توقف المعدات." },
    { en: "Prepared technical specifications and bills of materials for electrical projects.", ar: "أعدّ المواصفات الفنية وقوائم المواد للمشاريع الكهربائية." },
    { en: "Ensured compliance with Saudi Electricity Company standards and safety regulations.", ar: "ضمن الامتثال لمعايير الشركة السعودية للكهرباء وأنظمة السلامة." },
    { en: "Collaborated with civil and mechanical teams on integrated system design.", ar: "تعاون مع الفرق المدنية والميكانيكية في تصميم الأنظمة المتكاملة." },
    { en: "Prepared engineering reports and documentation for project milestones.", ar: "أعدّ التقارير الهندسية والتوثيق لمراحل المشروع." },
  ],
  credentials: [
    { kind: "registration", title: { en: "Saudi Council of Engineers Professional Accreditation", ar: "الاعتماد المهني — الهيئة السعودية للمهندسين" }, issuer: "Saudi Council of Engineers" },
    { kind: "certification", title: { en: "Project Management Certification", ar: "شهادة إدارة المشاريع" } },
    { kind: "training", title: { en: "Electrical Safety Training", ar: "تدريب السلامة الكهربائية" } },
    { kind: "certification", title: { en: "PLC Programming Certificate", ar: "شهادة برمجة وحدات التحكم المنطقي" } },
  ],
  keywords: [
    "Electrical Engineer", "Power Distribution", "Load Calculations", "PLC", "AutoCAD Electrical",
    "ETAP", "Saudi Council of Engineers",
    "مهندس كهربائي", "توزيع الطاقة", "حسابات الأحمال", "الاعتماد المهني",
  ],
};

const INDUSTRIAL_ENGINEER: RolePack = {
  slug: "industrial-engineer",
  title: { en: "Industrial Engineer", ar: "مهندس صناعي" },
  aliases: [
    "Industrial Engineer", "Process Engineer", "Manufacturing Engineer", "Production Engineer",
    "مهندس صناعي", "مهندسة صناعية", "مهندس عمليات", "مهندس إنتاج",
  ],
  groups: [
    {
      label: { en: "Process & Systems", ar: "العمليات والأنظمة" },
      items: [
        { en: "Process improvement", ar: "تحسين العمليات" },
        { en: "Workflow analysis", ar: "تحليل تدفق العمل" },
        { en: "Capacity planning", ar: "تخطيط الطاقة الإنتاجية" },
        { en: "Quality management systems", ar: "أنظمة إدارة الجودة" },
      ],
    },
    {
      label: { en: "Tools & Methods", ar: "الأدوات والمنهجيات" },
      items: [
        { en: "Lean manufacturing", ar: "التصنيع الرشيق" },
        { en: "Six Sigma", ar: "سيكس سيجما" },
        { en: "Simulation software", ar: "برمجيات المحاكاة" },
        { en: "Statistical process control", ar: "ضبط العمليات الإحصائي" },
      ],
    },
    {
      label: { en: "Operations", ar: "العمليات التشغيلية" },
      items: [
        { en: "Production scheduling", ar: "جدولة الإنتاج" },
        { en: "Inventory management", ar: "إدارة المخزون" },
        { en: "Safety compliance", ar: "الامتثال لمتطلبات السلامة" },
        { en: "Cost analysis", ar: "تحليل التكاليف" },
      ],
    },
  ],
  duties: [
    { en: "Analyzed production workflows to identify and eliminate inefficiencies.", ar: "حلّل تدفقات الإنتاج لتحديد أوجه القصور والتخلص منها." },
    { en: "Designed process improvements using lean manufacturing and Six Sigma methodologies.", ar: "صمّم تحسينات للعمليات باستخدام منهجيات التصنيع الرشيق وسيكس سيجما." },
    { en: "Developed capacity plans to align production output with demand.", ar: "وضع خطط الطاقة الإنتاجية لمواءمة الإنتاج مع الطلب." },
    { en: "Implemented statistical process control to monitor and improve quality.", ar: "طبّق ضبط العمليات الإحصائي لمراقبة الجودة وتحسينها." },
    { en: "Coordinated with production teams on scheduling and resource allocation.", ar: "نسّق مع فرق الإنتاج بشأن الجدولة وتوزيع الموارد." },
    { en: "Conducted time-and-motion studies to standardize work processes.", ar: "أجرى دراسات الوقت والحركة لتوحيد إجراءات العمل." },
    { en: "Managed inventory levels to balance holding cost against production continuity.", ar: "أدار مستويات المخزون لموازنة تكلفة التخزين مع استمرارية الإنتاج." },
    { en: "Prepared cost analyses to support process and equipment investment decisions.", ar: "أعدّ تحليلات التكلفة لدعم قرارات الاستثمار في العمليات والمعدات." },
    { en: "Developed and maintained quality management system documentation.", ar: "طوّر وثائق نظام إدارة الجودة وحافظ عليها." },
    { en: "Used simulation software to model and evaluate proposed process changes.", ar: "استخدم برمجيات المحاكاة لنمذجة التغييرات المقترحة على العمليات وتقييمها." },
    { en: "Monitored safety compliance across production and warehouse operations.", ar: "راقب الامتثال لمتطلبات السلامة في عمليات الإنتاج والمستودعات." },
    { en: "Collaborated with cross-functional teams on continuous-improvement initiatives.", ar: "تعاون مع فرق متعددة التخصصات في مبادرات التحسين المستمر." },
  ],
  credentials: [
    { kind: "registration", title: { en: "Saudi Council of Engineers Professional Accreditation", ar: "الاعتماد المهني — الهيئة السعودية للمهندسين" }, issuer: "Saudi Council of Engineers" },
    { kind: "certification", title: { en: "Six Sigma Green Belt", ar: "شهادة الحزام الأخضر في سيكس سيجما" } },
    { kind: "certification", title: { en: "Lean Manufacturing Certificate", ar: "شهادة التصنيع الرشيق" } },
    { kind: "training", title: { en: "Quality Management Systems Training", ar: "تدريب أنظمة إدارة الجودة" } },
  ],
  keywords: [
    "Industrial Engineer", "Process Improvement", "Lean Manufacturing", "Six Sigma", "Capacity Planning",
    "Saudi Council of Engineers",
    "مهندس صناعي", "تحسين العمليات", "التصنيع الرشيق", "الاعتماد المهني",
  ],
};

const AUDITOR: RolePack = {
  slug: "auditor",
  title: { en: "Auditor", ar: "مراجع حسابات" },
  aliases: [
    "Auditor", "Internal Auditor", "External Auditor", "Audit Associate",
    "مراجع حسابات", "مراجعة حسابات", "مدقق حسابات", "مراجع داخلي",
  ],
  groups: [
    {
      label: { en: "Audit & Assurance", ar: "المراجعة والتأكيد" },
      items: [
        { en: "Risk assessment", ar: "تقييم المخاطر" },
        { en: "Internal controls testing", ar: "اختبار الضوابط الداخلية" },
        { en: "Substantive testing", ar: "الاختبارات الجوهرية" },
        { en: "Audit planning", ar: "تخطيط المراجعة" },
      ],
    },
    {
      label: { en: "Systems", ar: "الأنظمة" },
      items: [
        { en: "Audit management software", ar: "برمجيات إدارة المراجعة" },
        { en: "ERP systems", ar: "أنظمة تخطيط الموارد" },
        { en: "Data analytics tools", ar: "أدوات تحليل البيانات" },
        { en: "Excel", ar: "إكسل" },
      ],
    },
    {
      label: { en: "Compliance & Reporting", ar: "الامتثال والتقارير" },
      items: [
        { en: "Regulatory compliance", ar: "الامتثال التنظيمي" },
        { en: "Audit reporting", ar: "إعداد تقارير المراجعة" },
        { en: "Fraud detection", ar: "كشف الاحتيال" },
        { en: "Working-paper documentation", ar: "توثيق أوراق العمل" },
      ],
    },
  ],
  duties: [
    { en: "Planned and executed audit engagements in accordance with applicable auditing standards.", ar: "خطط لمهام المراجعة ونفذها وفق معايير المراجعة المعتمدة." },
    { en: "Assessed internal controls and identified areas of financial and operational risk.", ar: "قيّم الضوابط الداخلية وحدد مجالات المخاطر المالية والتشغيلية." },
    { en: "Performed substantive testing on financial statement balances and transactions.", ar: "أجرى اختبارات جوهرية على أرصدة القوائم المالية والمعاملات." },
    { en: "Documented audit findings and working papers to support conclusions.", ar: "وثّق نتائج المراجعة وأوراق العمل لدعم الاستنتاجات." },
    { en: "Prepared audit reports summarizing findings and recommendations for management.", ar: "أعدّ تقارير المراجعة الموجزة للنتائج والتوصيات لإدارة الشركة." },
    { en: "Reviewed financial statements for accuracy and compliance with accounting standards.", ar: "راجع القوائم المالية للتأكد من دقتها ومطابقتها للمعايير المحاسبية." },
    { en: "Identified control weaknesses and recommended process improvements.", ar: "حدد نقاط الضعف في الضوابط واقترح تحسينات للعمليات." },
    { en: "Coordinated with client staff to gather audit evidence and documentation.", ar: "نسّق مع موظفي العميل لجمع أدلة المراجعة والمستندات." },
    { en: "Used data analytics tools to identify unusual transactions and trends.", ar: "استخدم أدوات تحليل البيانات لتحديد المعاملات والاتجاهات غير المعتادة." },
    { en: "Monitored compliance with regulatory requirements and internal policies.", ar: "راقب الامتثال للمتطلبات التنظيمية والسياسات الداخلية." },
    { en: "Assisted in fraud investigations and forensic accounting reviews.", ar: "ساعد في تحقيقات الاحتيال ومراجعات المحاسبة الجنائية." },
    { en: "Maintained audit files in accordance with quality-control and confidentiality requirements.", ar: "حافظ على ملفات المراجعة وفق متطلبات ضبط الجودة والسرية." },
  ],
  credentials: [
    { kind: "membership", title: { en: "SOCPA Fellowship / Membership", ar: "عضوية الهيئة السعودية للمراجعين والمحاسبين" }, issuer: "Saudi Organization for Chartered and Professional Accountants" },
    { kind: "certification", title: { en: "Certified Internal Auditor (CIA)", ar: "شهادة المراجع الداخلي المعتمد" } },
    { kind: "certification", title: { en: "Certified Public Accountant (CPA)", ar: "شهادة المحاسب القانوني المعتمد" } },
    { kind: "training", title: { en: "Fraud Examination Training", ar: "تدريب فحص الاحتيال" } },
  ],
  keywords: [
    "Auditor", "Internal Audit", "Risk Assessment", "Internal Controls", "Audit Reporting", "SOCPA",
    "مراجع حسابات", "تقييم المخاطر", "الضوابط الداخلية", "عضوية الهيئة السعودية",
  ],
};

const SOFTWARE_DEVELOPER: RolePack = {
  slug: "software-developer",
  title: { en: "Software Developer", ar: "مطوّر برمجيات" },
  aliases: [
    "Software Developer", "Software Engineer", "Backend Developer", "Frontend Developer", "Full Stack Developer",
    "مطوّر برمجيات", "مطورة برمجيات", "مهندس برمجيات", "مطور واجهات",
  ],
  groups: [
    {
      label: { en: "Development", ar: "التطوير" },
      items: [
        { en: "Application development", ar: "تطوير التطبيقات" },
        { en: "API design", ar: "تصميم واجهات برمجة التطبيقات" },
        { en: "Database design", ar: "تصميم قواعد البيانات" },
        { en: "Code review", ar: "مراجعة الأكواد" },
      ],
    },
    {
      label: { en: "Tools & Practices", ar: "الأدوات والممارسات" },
      items: [
        { en: "Version control (Git)", ar: "إدارة الإصدارات (جِت)" },
        { en: "CI/CD pipelines", ar: "خطوط التكامل والنشر المستمر" },
        { en: "Unit testing", ar: "الاختبار البرمجي" },
        { en: "Agile / Scrum", ar: "أجايل وسكرم" },
      ],
    },
    {
      label: { en: "Infrastructure", ar: "البنية التحتية" },
      items: [
        { en: "Cloud platforms", ar: "منصات الحوسبة السحابية" },
        { en: "Containerization", ar: "الحاويات البرمجية" },
        { en: "Performance optimization", ar: "تحسين الأداء" },
        { en: "Security best practices", ar: "أفضل ممارسات الأمان" },
      ],
    },
  ],
  duties: [
    { en: "Designed and developed software applications to meet business requirements.", ar: "صمّم تطبيقات برمجية وطوّرها لتلبية متطلبات العمل." },
    { en: "Built and maintained RESTful APIs for internal and external integrations.", ar: "بنى واجهات برمجة تطبيقات RESTful وصانها للتكاملات الداخلية والخارجية." },
    { en: "Wrote and maintained unit and integration tests to ensure code quality.", ar: "كتب اختبارات وحدة وتكامل وصانها لضمان جودة الكود." },
    { en: "Participated in code reviews and provided constructive feedback to peers.", ar: "شارك في مراجعة الأكواد وقدّم ملاحظات بناءة للزملاء." },
    { en: "Designed database schemas and optimized queries for performance.", ar: "صمّم مخططات قواعد البيانات وحسّن الاستعلامات لتحسين الأداء." },
    { en: "Deployed applications using CI/CD pipelines and cloud infrastructure.", ar: "نشر التطبيقات باستخدام خطوط التكامل والنشر المستمر والبنية السحابية." },
    { en: "Debugged and resolved production issues to minimize downtime.", ar: "شخّص وأصلح مشكلات بيئة الإنتاج لتقليل وقت التوقف." },
    { en: "Collaborated with product managers and designers on feature specifications.", ar: "تعاون مع مديري المنتج والمصممين على مواصفات الميزات." },
    { en: "Followed secure coding practices to protect against common vulnerabilities.", ar: "التزم بممارسات البرمجة الآمنة للحماية من الثغرات الشائعة." },
    { en: "Participated in Agile ceremonies including sprint planning and retrospectives.", ar: "شارك في فعاليات أجايل بما يشمل تخطيط السبرنت والمراجعات الرجعية." },
    { en: "Documented technical designs and maintained internal knowledge bases.", ar: "وثّق التصاميم الفنية وحافظ على قواعد المعرفة الداخلية." },
    { en: "Mentored junior developers on coding standards and best practices.", ar: "وجّه المطورين المبتدئين حول معايير البرمجة وأفضل الممارسات." },
  ],
  credentials: [
    { kind: "certification", title: { en: "AWS Certified Developer", ar: "شهادة مطوّر أمازون ويب سيرفيسز" } },
    { kind: "certification", title: { en: "Microsoft Certified: Azure Developer", ar: "شهادة مايكروسوفت المعتمدة لمطوري أزور" } },
    { kind: "training", title: { en: "Agile / Scrum Training", ar: "تدريب أجايل وسكرم" } },
    { kind: "certification", title: { en: "Certified Kubernetes Application Developer (CKAD)", ar: "شهادة مطوّر تطبيقات كوبرنيتيس المعتمد" } },
  ],
  keywords: [
    "Software Developer", "API Design", "CI/CD", "Git", "Cloud Computing", "Unit Testing", "Agile",
    "مطوّر برمجيات", "تصميم واجهات البرمجة", "إدارة الإصدارات", "الحوسبة السحابية",
  ],
};

const IT_SUPPORT: RolePack = {
  slug: "it-support",
  title: { en: "IT Support Specialist", ar: "أخصائي دعم تقني" },
  aliases: [
    "IT Support Specialist", "Help Desk Technician", "Technical Support Engineer", "IT Support Technician",
    "أخصائي دعم تقني", "فني دعم فني", "مهندس دعم تقني", "فني حاسب آلي",
  ],
  groups: [
    {
      label: { en: "Support & Troubleshooting", ar: "الدعم واستكشاف الأعطال" },
      items: [
        { en: "Hardware troubleshooting", ar: "استكشاف أعطال الأجهزة" },
        { en: "Software troubleshooting", ar: "استكشاف أعطال البرمجيات" },
        { en: "Network troubleshooting", ar: "استكشاف أعطال الشبكة" },
        { en: "Ticket management", ar: "إدارة تذاكر الدعم" },
      ],
    },
    {
      label: { en: "Systems", ar: "الأنظمة" },
      items: [
        { en: "Active Directory", ar: "الدليل النشط" },
        { en: "Remote support tools", ar: "أدوات الدعم عن بعد" },
        { en: "ITSM platforms", ar: "منصات إدارة خدمات تقنية المعلومات" },
        { en: "Windows / macOS administration", ar: "إدارة أنظمة ويندوز وماك" },
      ],
    },
    {
      label: { en: "Operations", ar: "العمليات" },
      items: [
        { en: "User onboarding", ar: "إعداد المستخدمين الجدد" },
        { en: "Asset management", ar: "إدارة الأصول التقنية" },
        { en: "Security compliance", ar: "الامتثال الأمني" },
        { en: "Documentation", ar: "التوثيق" },
      ],
    },
  ],
  duties: [
    { en: "Diagnosed and resolved hardware, software and network issues for end users.", ar: "شخّص مشكلات الأجهزة والبرمجيات والشبكة للمستخدمين وأصلحها." },
    { en: "Managed support tickets from creation through resolution within service-level targets.", ar: "أدار تذاكر الدعم من إنشائها حتى حلها ضمن أهداف مستوى الخدمة." },
    { en: "Set up and configured workstations, accounts and access for new employees.", ar: "أعدّ وضبط محطات العمل والحسابات والصلاحيات للموظفين الجدد." },
    { en: "Administered user accounts and permissions through Active Directory.", ar: "أدار حسابات المستخدمين وصلاحياتهم عبر الدليل النشط." },
    { en: "Provided remote and on-site technical support to staff across departments.", ar: "قدّم دعماً فنياً عن بعد وفي الموقع للموظفين في مختلف الإدارات." },
    { en: "Maintained inventory of IT assets, including hardware and software licences.", ar: "حافظ على جرد الأصول التقنية بما يشمل الأجهزة وتراخيص البرمجيات." },
    { en: "Escalated complex issues to senior IT staff or vendors when required.", ar: "صعّد المشكلات المعقدة لكبار موظفي تقنية المعلومات أو الموردين عند الحاجة." },
    { en: "Applied security patches and updates to maintain system integrity.", ar: "طبّق تحديثات الأمان للحفاظ على سلامة الأنظمة." },
    { en: "Documented troubleshooting steps and solutions in the knowledge base.", ar: "وثّق خطوات استكشاف الأعطال وحلولها في قاعدة المعرفة." },
    { en: "Trained end users on new systems, software and IT policies.", ar: "درّب المستخدمين على الأنظمة والبرمجيات والسياسات التقنية الجديدة." },
    { en: "Monitored network and system performance to identify potential issues.", ar: "راقب أداء الشبكة والأنظمة لتحديد المشكلات المحتملة." },
    { en: "Ensured compliance with IT security policies and data-protection practices.", ar: "ضمن الامتثال لسياسات الأمان التقني وممارسات حماية البيانات." },
  ],
  credentials: [
    { kind: "certification", title: { en: "CompTIA A+", ar: "شهادة CompTIA A+" } },
    { kind: "certification", title: { en: "Microsoft Certified: Modern Desktop Administrator", ar: "شهادة مايكروسوفت لمسؤول سطح المكتب الحديث" } },
    { kind: "training", title: { en: "ITIL Foundation Training", ar: "تدريب أساسيات ITIL" } },
    { kind: "certification", title: { en: "CompTIA Network+", ar: "شهادة CompTIA Network+" } },
  ],
  keywords: [
    "IT Support", "Help Desk", "Technical Support", "Active Directory", "Troubleshooting", "ITIL",
    "أخصائي دعم تقني", "استكشاف الأعطال", "الدليل النشط", "دعم فني",
  ],
};

const NETWORK_ENGINEER: RolePack = {
  slug: "network-engineer",
  title: { en: "Network Engineer", ar: "مهندس شبكات" },
  aliases: [
    "Network Engineer", "Network Administrator", "Systems Network Engineer", "Network Security Engineer",
    "مهندس شبكات", "مهندسة شبكات", "مسؤول شبكات", "مدير شبكات",
  ],
  groups: [
    {
      label: { en: "Network Design & Operations", ar: "تصميم الشبكات وتشغيلها" },
      items: [
        { en: "Network architecture", ar: "بنية الشبكة" },
        { en: "Routing and switching", ar: "التوجيه والتحويل" },
        { en: "Firewall configuration", ar: "إعداد جدران الحماية" },
        { en: "VPN management", ar: "إدارة الشبكات الافتراضية الخاصة" },
      ],
    },
    {
      label: { en: "Tools & Systems", ar: "الأدوات والأنظمة" },
      items: [
        { en: "Network monitoring tools", ar: "أدوات مراقبة الشبكة" },
        { en: "Cisco / Juniper platforms", ar: "منصات سيسكو وجونيبر" },
        { en: "Network management software", ar: "برمجيات إدارة الشبكة" },
        { en: "SD-WAN", ar: "الشبكات الواسعة المعرّفة بالبرمجيات" },
      ],
    },
    {
      label: { en: "Security & Compliance", ar: "الأمان والامتثال" },
      items: [
        { en: "Network security", ar: "أمان الشبكات" },
        { en: "Intrusion detection", ar: "كشف الاختراقات" },
        { en: "Disaster recovery planning", ar: "التخطيط للتعافي من الكوارث" },
        { en: "Documentation", ar: "التوثيق" },
      ],
    },
  ],
  duties: [
    { en: "Designed and implemented network architecture to support organizational requirements.", ar: "صمّم بنية الشبكة ونفذها لدعم متطلبات المؤسسة." },
    { en: "Configured and maintained routers, switches and firewalls.", ar: "أعدّ الموجهات والمحولات وجدران الحماية وصانها." },
    { en: "Monitored network performance and resolved connectivity issues.", ar: "راقب أداء الشبكة وحلّ مشكلات الاتصال." },
    { en: "Managed VPN connections for remote and site-to-site access.", ar: "أدار اتصالات الشبكات الافتراضية الخاصة للوصول عن بعد وبين المواقع." },
    { en: "Implemented network security measures, including firewalls and intrusion detection.", ar: "طبّق تدابير أمان الشبكة بما يشمل جدران الحماية وكشف الاختراقات." },
    { en: "Conducted network capacity planning to support growth and performance needs.", ar: "خطط لسعة الشبكة لدعم النمو ومتطلبات الأداء." },
    { en: "Troubleshot and resolved hardware and software network faults.", ar: "شخّص أعطال الشبكة في الأجهزة والبرمجيات وأصلحها." },
    { en: "Maintained documentation of network topology, configurations and procedures.", ar: "حافظ على توثيق بنية الشبكة وإعداداتها وإجراءاتها." },
    { en: "Coordinated with vendors and service providers on network infrastructure projects.", ar: "نسّق مع الموردين ومزودي الخدمة في مشاريع البنية التحتية للشبكة." },
    { en: "Developed and tested disaster-recovery and business-continuity plans.", ar: "طوّر واختبر خطط التعافي من الكوارث واستمرارية الأعمال." },
    { en: "Applied firmware and security updates to network equipment.", ar: "طبّق تحديثات البرامج الثابتة والأمان على معدات الشبكة." },
    { en: "Provided technical support and training to IT staff on network systems.", ar: "قدّم الدعم الفني والتدريب لموظفي تقنية المعلومات حول أنظمة الشبكة." },
  ],
  credentials: [
    { kind: "certification", title: { en: "Cisco Certified Network Associate (CCNA)", ar: "شهادة سيسكو المعتمدة لمهندسي الشبكات" } },
    { kind: "certification", title: { en: "Cisco Certified Network Professional (CCNP)", ar: "شهادة سيسكو الاحترافية للشبكات" } },
    { kind: "certification", title: { en: "CompTIA Network+", ar: "شهادة CompTIA Network+" } },
    { kind: "training", title: { en: "Network Security Training", ar: "تدريب أمان الشبكات" } },
  ],
  keywords: [
    "Network Engineer", "Routing", "Switching", "Firewall", "VPN", "Cisco", "Network Security",
    "مهندس شبكات", "التوجيه والتحويل", "جدران الحماية", "أمان الشبكات",
  ],
};

const HR_SPECIALIST: RolePack = {
  slug: "hr-specialist",
  title: { en: "Human Resources Specialist", ar: "أخصائي موارد بشرية" },
  aliases: [
    "Human Resources Specialist", "HR Specialist", "HR Generalist", "HR Coordinator",
    "أخصائي موارد بشرية", "أخصائية موارد بشرية", "منسق موارد بشرية", "مسؤول موارد بشرية",
  ],
  groups: [
    {
      label: { en: "Recruitment & Onboarding", ar: "التوظيف والاستقطاب" },
      items: [
        { en: "Recruitment", ar: "التوظيف" },
        { en: "Candidate screening", ar: "فرز المرشحين" },
        { en: "Onboarding", ar: "إعداد الموظفين الجدد" },
        { en: "Offer negotiation", ar: "التفاوض على العروض" },
      ],
    },
    {
      label: { en: "HR Operations", ar: "العمليات الإدارية للموارد البشرية" },
      items: [
        { en: "Payroll coordination", ar: "تنسيق الرواتب" },
        { en: "HRIS systems", ar: "أنظمة معلومات الموارد البشرية" },
        { en: "Employee records management", ar: "إدارة سجلات الموظفين" },
        { en: "GOSI / Saudization compliance", ar: "الامتثال للتأمينات الاجتماعية والسعودة" },
      ],
    },
    {
      label: { en: "Employee Relations", ar: "علاقات الموظفين" },
      items: [
        { en: "Performance management", ar: "إدارة الأداء" },
        { en: "Policy administration", ar: "تطبيق السياسات" },
        { en: "Employee engagement", ar: "مشاركة الموظفين" },
        { en: "Conflict resolution", ar: "حل النزاعات" },
      ],
    },
  ],
  duties: [
    { en: "Managed the full recruitment cycle from job posting through offer negotiation.", ar: "أدار دورة التوظيف الكاملة من نشر الوظيفة حتى التفاوض على العرض." },
    { en: "Screened resumes and conducted initial candidate interviews.", ar: "فرز السير الذاتية وأجرى المقابلات الأولية للمرشحين." },
    { en: "Coordinated new-employee onboarding, including documentation and orientation.", ar: "نسّق إعداد الموظفين الجدد بما يشمل التوثيق والتعريف بالمؤسسة." },
    { en: "Maintained employee records in the human resources information system.", ar: "حافظ على سجلات الموظفين في نظام معلومات الموارد البشرية." },
    { en: "Administered company policies and ensured consistent application across departments.", ar: "طبّق سياسات الشركة وضمن تطبيقها بشكل متسق عبر الإدارات." },
    { en: "Coordinated with payroll to ensure accurate and timely processing of compensation.", ar: "نسّق مع قسم الرواتب لضمان معالجة التعويضات بدقة وفي وقتها." },
    { en: "Supported performance-management processes, including reviews and improvement plans.", ar: "دعم عمليات إدارة الأداء بما يشمل التقييمات وخطط التحسين." },
    { en: "Ensured compliance with GOSI and Saudization requirements.", ar: "ضمن الامتثال لمتطلبات التأمينات الاجتماعية ونطاقات السعودة." },
    { en: "Addressed employee relations issues and facilitated conflict resolution.", ar: "تعامل مع قضايا علاقات الموظفين وسهّل حل النزاعات." },
    { en: "Organized employee-engagement initiatives and internal communications.", ar: "نظّم مبادرات مشاركة الموظفين والتواصل الداخلي." },
    { en: "Prepared HR reports and metrics for management review.", ar: "أعدّ تقارير ومؤشرات الموارد البشرية لمراجعة الإدارة." },
    { en: "Advised managers on labour-law compliance and HR best practices.", ar: "قدّم المشورة للمدراء بشأن الامتثال لنظام العمل وأفضل ممارسات الموارد البشرية." },
  ],
  credentials: [
    { kind: "certification", title: { en: "Professional in Human Resources (PHR)", ar: "شهادة المتخصص المهني في الموارد البشرية" } },
    { kind: "certification", title: { en: "SHRM Certified Professional (SHRM-CP)", ar: "شهادة SHRM المهنية المعتمدة" } },
    { kind: "training", title: { en: "Saudi Labour Law Training", ar: "تدريب نظام العمل السعودي" } },
    { kind: "training", title: { en: "Recruitment & Talent Acquisition Training", ar: "تدريب التوظيف واستقطاب المواهب" } },
  ],
  keywords: [
    "HR Specialist", "Recruitment", "Onboarding", "GOSI", "Saudization", "Employee Relations", "HRIS",
    "أخصائي موارد بشرية", "التوظيف", "السعودة", "علاقات الموظفين",
  ],
};

const PROJECT_MANAGER: RolePack = {
  slug: "project-manager",
  title: { en: "Project Manager", ar: "مدير مشروع" },
  aliases: [
    "Project Manager", "Program Manager", "PMO Analyst", "Project Coordinator",
    "مدير مشروع", "مديرة مشروع", "منسق مشاريع", "محلل مكتب إدارة المشاريع",
  ],
  groups: [
    {
      label: { en: "Planning & Execution", ar: "التخطيط والتنفيذ" },
      items: [
        { en: "Project planning", ar: "تخطيط المشاريع" },
        { en: "Scope management", ar: "إدارة النطاق" },
        { en: "Schedule management", ar: "إدارة الجدول الزمني" },
        { en: "Risk management", ar: "إدارة المخاطر" },
      ],
    },
    {
      label: { en: "Tools & Methods", ar: "الأدوات والمنهجيات" },
      items: [
        { en: "Microsoft Project", ar: "مايكروسوفت بروجكت" },
        { en: "Agile / Scrum", ar: "أجايل وسكرم" },
        { en: "Jira", ar: "جيرا" },
        { en: "Gantt charts", ar: "مخططات جانت" },
      ],
    },
    {
      label: { en: "Stakeholder & Delivery", ar: "أصحاب المصلحة والتسليم" },
      items: [
        { en: "Stakeholder communication", ar: "التواصل مع أصحاب المصلحة" },
        { en: "Budget tracking", ar: "متابعة الميزانية" },
        { en: "Vendor coordination", ar: "التنسيق مع الموردين" },
        { en: "Status reporting", ar: "تقارير الحالة" },
      ],
    },
  ],
  duties: [
    { en: "Developed project plans defining scope, timeline, resources and deliverables.", ar: "وضع خطط المشاريع محددة النطاق والجدول الزمني والموارد والمخرجات." },
    { en: "Managed project schedules and tracked progress against milestones.", ar: "أدار الجداول الزمنية للمشاريع وتابع التقدم مقارنة بالمعالم الرئيسية." },
    { en: "Identified and mitigated project risks throughout the project lifecycle.", ar: "حدد مخاطر المشروع وخفف منها طوال دورة حياة المشروع." },
    { en: "Coordinated cross-functional teams to ensure timely project delivery.", ar: "نسّق بين الفرق متعددة التخصصات لضمان تسليم المشروع في وقته." },
    { en: "Tracked project budgets and reported variances to stakeholders.", ar: "تابع ميزانيات المشاريع وأبلغ أصحاب المصلحة بالانحرافات." },
    { en: "Facilitated project meetings, including kickoffs, status updates and retrospectives.", ar: "أدار اجتماعات المشروع بما يشمل الانطلاقة وتحديثات الحالة والمراجعات الرجعية." },
    { en: "Managed stakeholder communications and expectations throughout the project.", ar: "أدار تواصل أصحاب المصلحة وتوقعاتهم طوال المشروع." },
    { en: "Coordinated with vendors and external partners on deliverables and timelines.", ar: "نسّق مع الموردين والشركاء الخارجيين بشأن المخرجات والجداول الزمنية." },
    { en: "Prepared and delivered project status reports to leadership.", ar: "أعدّ تقارير حالة المشروع وقدّمها للإدارة العليا." },
    { en: "Managed scope changes through a formal change-control process.", ar: "أدار التغييرات في نطاق المشروع من خلال عملية ضبط تغيير رسمية." },
    { en: "Applied Agile and traditional project-management methodologies as appropriate.", ar: "طبّق منهجيات أجايل والإدارة التقليدية للمشاريع بحسب الحاجة." },
    { en: "Conducted post-project reviews to capture lessons learned.", ar: "أجرى مراجعات ما بعد المشروع لتوثيق الدروس المستفادة." },
  ],
  credentials: [
    { kind: "certification", title: { en: "Project Management Professional (PMP)", ar: "شهادة إدارة المشاريع الاحترافية" } },
    { kind: "certification", title: { en: "Certified ScrumMaster (CSM)", ar: "شهادة سكرم ماستر المعتمدة" } },
    { kind: "training", title: { en: "Structured Project Management Methodology Training", ar: "تدريب منهجية إدارة المشاريع الهيكلية" } },
    { kind: "certification", title: { en: "PMI Agile Certified Practitioner (PMI-ACP)", ar: "شهادة PMI للممارس المعتمد في أجايل" } },
  ],
  keywords: [
    "Project Manager", "Project Planning", "Risk Management", "Agile", "Scrum", "PMP", "Stakeholder Management",
    "مدير مشروع", "تخطيط المشاريع", "إدارة المخاطر", "أجايل",
  ],
};

const SALES_REPRESENTATIVE: RolePack = {
  slug: "sales-representative",
  title: { en: "Sales Representative", ar: "مندوب مبيعات" },
  aliases: [
    "Sales Representative", "Sales Executive", "Account Executive", "Business Development Representative",
    "مندوب مبيعات", "مندوبة مبيعات", "تنفيذي مبيعات", "مسؤول تطوير أعمال",
  ],
  groups: [
    {
      label: { en: "Sales Activities", ar: "أنشطة المبيعات" },
      items: [
        { en: "Lead generation", ar: "توليد العملاء المحتملين" },
        { en: "Client meetings", ar: "اجتماعات العملاء" },
        { en: "Product presentations", ar: "عروض المنتجات" },
        { en: "Closing deals", ar: "إتمام الصفقات" },
      ],
    },
    {
      label: { en: "Systems", ar: "الأنظمة" },
      items: [
        { en: "CRM software", ar: "برمجيات إدارة علاقات العملاء" },
        { en: "Sales pipeline tracking", ar: "متابعة قنوات المبيعات" },
        { en: "Quotation software", ar: "برمجيات إعداد عروض الأسعار" },
        { en: "Sales reporting tools", ar: "أدوات تقارير المبيعات" },
      ],
    },
    {
      label: { en: "Account Management", ar: "إدارة الحسابات" },
      items: [
        { en: "Customer relationship management", ar: "إدارة علاقات العملاء" },
        { en: "Contract negotiation", ar: "التفاوض على العقود" },
        { en: "After-sales follow-up", ar: "متابعة ما بعد البيع" },
        { en: "Sales reporting", ar: "تقارير المبيعات" },
      ],
    },
  ],
  duties: [
    { en: "Identified and qualified new sales leads through prospecting and referrals.", ar: "حدد وأهّل عملاء محتملين جدد من خلال التنقيب والإحالات." },
    { en: "Conducted client meetings and product presentations to drive sales.", ar: "أجرى اجتماعات مع العملاء وقدّم عروض المنتجات لتحقيق المبيعات." },
    { en: "Negotiated pricing and contract terms with prospective customers.", ar: "تفاوض على الأسعار وشروط العقود مع العملاء المحتملين." },
    { en: "Maintained accurate records of customer interactions in the CRM system.", ar: "حافظ على سجلات دقيقة لتفاعلات العملاء في نظام إدارة علاقات العملاء." },
    { en: "Managed a portfolio of accounts and built long-term customer relationships.", ar: "أدار محفظة من الحسابات وبنى علاقات طويلة الأمد مع العملاء." },
    { en: "Prepared and delivered sales quotations and proposals to clients.", ar: "أعدّ عروض الأسعار والمقترحات وقدّمها للعملاء." },
    { en: "Followed up with customers post-sale to ensure satisfaction and repeat business.", ar: "تابع مع العملاء بعد البيع لضمان رضاهم وتكرار التعامل." },
    { en: "Tracked sales activity and pipeline progress against monthly targets.", ar: "تابع نشاط المبيعات وتقدم قناة المبيعات مقارنة بالأهداف الشهرية." },
    { en: "Collaborated with the marketing team on lead-generation campaigns.", ar: "تعاون مع فريق التسويق في حملات توليد العملاء المحتملين." },
    { en: "Resolved customer concerns and escalated complex issues appropriately.", ar: "حلّ مخاوف العملاء وصعّد المشكلات المعقدة عند الحاجة." },
    { en: "Prepared sales reports summarizing performance and market feedback.", ar: "أعدّ تقارير المبيعات الموجزة للأداء وملاحظات السوق." },
    { en: "Stayed current on product knowledge and competitor offerings.", ar: "واكب المعرفة بالمنتجات وعروض المنافسين." },
  ],
  credentials: [
    { kind: "certification", title: { en: "Sales and Marketing Professional Membership", ar: "عضوية مهنية في المبيعات والتسويق" } },
    { kind: "certification", title: { en: "CRM Software Proficiency Certificate", ar: "شهادة إتقان برمجيات إدارة علاقات العملاء" } },
    { kind: "training", title: { en: "Negotiation Skills Training", ar: "تدريب مهارات التفاوض" } },
    { kind: "training", title: { en: "Consultative Selling Training", ar: "تدريب البيع الاستشاري" } },
  ],
  keywords: [
    "Sales Representative", "Lead Generation", "CRM", "Negotiation", "Account Management",
    "Sales Pipeline", "Client Relationship Management",
    "مندوب مبيعات", "توليد العملاء المحتملين", "إدارة علاقات العملاء", "التفاوض", "قناة المبيعات",
  ],
};

const CUSTOMER_SERVICE: RolePack = {
  slug: "customer-service",
  title: { en: "Customer Service Representative", ar: "ممثل خدمة عملاء" },
  aliases: [
    "Customer Service Representative", "Customer Support Specialist", "Call Center Agent", "Client Services Representative",
    "ممثل خدمة عملاء", "ممثلة خدمة عملاء", "أخصائي دعم عملاء", "موظف مركز اتصال",
  ],
  groups: [
    {
      label: { en: "Customer Support", ar: "دعم العملاء" },
      items: [
        { en: "Inbound call handling", ar: "التعامل مع المكالمات الواردة" },
        { en: "Complaint resolution", ar: "حل الشكاوى" },
        { en: "Order processing", ar: "معالجة الطلبات" },
        { en: "Live chat support", ar: "دعم الدردشة المباشرة" },
      ],
    },
    {
      label: { en: "Systems", ar: "الأنظمة" },
      items: [
        { en: "CRM software", ar: "برمجيات إدارة علاقات العملاء" },
        { en: "Ticketing systems", ar: "أنظمة تذاكر الدعم" },
        { en: "Call center software", ar: "برمجيات مراكز الاتصال" },
        { en: "Knowledge base tools", ar: "أدوات قاعدة المعرفة" },
      ],
    },
    {
      label: { en: "Quality & Service", ar: "الجودة والخدمة" },
      items: [
        { en: "Customer satisfaction", ar: "رضا العملاء" },
        { en: "Service-level compliance", ar: "الالتزام بمستوى الخدمة" },
        { en: "Upselling", ar: "البيع الإضافي" },
        { en: "Product knowledge", ar: "معرفة المنتج" },
      ],
    },
  ],
  duties: [
    { en: "Responded to customer inquiries via phone, email and live chat in a timely manner.", ar: "رد على استفسارات العملاء عبر الهاتف والبريد الإلكتروني والدردشة المباشرة في وقتها." },
    { en: "Resolved customer complaints and escalated unresolved issues appropriately.", ar: "حلّ شكاوى العملاء وصعّد المشكلات غير المحلولة عند الحاجة." },
    { en: "Processed customer orders, returns and exchanges accurately.", ar: "عالج طلبات العملاء والمرتجعات والاستبدالات بدقة." },
    { en: "Maintained detailed records of customer interactions in the CRM system.", ar: "حافظ على سجلات مفصلة لتفاعلات العملاء في نظام إدارة علاقات العملاء." },
    { en: "Provided product information and guidance to assist customer decision-making.", ar: "قدّم معلومات المنتج والإرشاد لمساعدة العملاء على اتخاذ القرار." },
    { en: "Met service-level targets for response time and resolution rate.", ar: "حقق أهداف مستوى الخدمة لوقت الاستجابة ومعدل الحل." },
    { en: "Identified upselling and cross-selling opportunities during customer interactions.", ar: "حدد فرص البيع الإضافي والبيع المتقاطع خلال التفاعل مع العملاء." },
    { en: "Collected and reported customer feedback to improve products and services.", ar: "جمع ملاحظات العملاء وأبلغ بها لتحسين المنتجات والخدمات." },
    { en: "Followed company policies and procedures when handling customer accounts.", ar: "التزم بسياسات الشركة وإجراءاتها عند التعامل مع حسابات العملاء." },
    { en: "De-escalated difficult customer situations while maintaining professionalism.", ar: "خفّف من التصعيد في المواقف الصعبة مع العملاء مع الحفاظ على الاحترافية." },
    { en: "Trained new team members on customer-service procedures and systems.", ar: "درّب أعضاء الفريق الجدد على إجراءات وأنظمة خدمة العملاء." },
    { en: "Contributed to team targets for customer satisfaction and retention.", ar: "ساهم في تحقيق أهداف الفريق لرضا العملاء والاحتفاظ بهم." },
  ],
  credentials: [
    { kind: "certification", title: { en: "Customer Service Excellence Certificate", ar: "شهادة التميز في خدمة العملاء" } },
    { kind: "training", title: { en: "Conflict Resolution Training", ar: "تدريب حل النزاعات" } },
    { kind: "training", title: { en: "Call Center Operations Training", ar: "تدريب عمليات مراكز الاتصال" } },
    { kind: "certification", title: { en: "CRM Software Proficiency Certificate", ar: "شهادة إتقان برمجيات إدارة علاقات العملاء" } },
  ],
  keywords: [
    "Customer Service", "Complaint Resolution", "CRM", "Call Center", "Customer Satisfaction",
    "Ticketing Systems", "Service Level Agreement",
    "ممثل خدمة عملاء", "حل الشكاوى", "رضا العملاء", "مركز الاتصال", "إدارة التذاكر",
  ],
};

/*
 * Confirmed missing entirely — a launch-readiness audit found the builder had no cached pack for
 * this title at all, and it is a common enough profession that the gap was worth naming on its own
 * (F-45 in `docs/known-issues.md`). Structured the same way every other pack here is: grouped
 * suggestions, confirmable duties, credentials that are offered rather than assumed.
 */
const GRAPHIC_DESIGNER: RolePack = {
  slug: "graphic-designer",
  title: { en: "Graphic Designer", ar: "مصمم جرافيك" },
  aliases: [
    "Graphic Designer", "Visual Designer", "Brand Designer", "Digital Designer",
    "مصمم جرافيك", "مصممة جرافيك", "مصمم غرافيك", "مصمم بصري", "مصمم هوية بصرية",
  ],
  groups: [
    {
      label: { en: "Design Software", ar: "برامج التصميم" },
      items: [
        { en: "Adobe Photoshop", ar: "أدوبي فوتوشوب" },
        { en: "Adobe Illustrator", ar: "أدوبي إلستريتور" },
        { en: "Adobe InDesign", ar: "أدوبي إنديزاين" },
        { en: "Figma", ar: "فيجما" },
      ],
    },
    {
      label: { en: "Brand & Print", ar: "الهوية والطباعة" },
      items: [
        { en: "Brand identity design", ar: "تصميم الهوية البصرية" },
        { en: "Logo design", ar: "تصميم الشعارات" },
        { en: "Print-ready artwork", ar: "تجهيز الملفات للطباعة" },
        { en: "Typography", ar: "الطباعة والخط" },
      ],
    },
    {
      label: { en: "Digital & Social", ar: "الرقمي والتواصل الاجتماعي" },
      items: [
        { en: "Social media design", ar: "تصميم محتوى التواصل الاجتماعي" },
        { en: "Marketing collateral", ar: "المواد التسويقية" },
        { en: "UI mockups", ar: "نماذج واجهات المستخدم" },
        { en: "Motion graphics", ar: "الرسوم المتحركة" },
      ],
    },
  ],
  duties: [
    { en: "Designed visual assets for print and digital channels aligned to brand guidelines.", ar: "صمّم أصولاً بصرية للطباعة والقنوات الرقمية بما يتوافق مع دليل الهوية." },
    { en: "Created and maintained brand identity elements including logos and style guides.", ar: "أنشأ عناصر الهوية البصرية بما فيها الشعارات ودليل الأسلوب وحافظ عليها." },
    { en: "Prepared print-ready artwork and coordinated with printers on production specs.", ar: "جهّز ملفات جاهزة للطباعة ونسّق مع المطابع حول مواصفات الإنتاج." },
    { en: "Designed layouts for marketing materials including brochures and social posts.", ar: "صمّم تخطيطات للمواد التسويقية بما فيها الكتيبات ومنشورات التواصل الاجتماعي." },
    { en: "Collaborated with marketing and product teams to translate briefs into visuals.", ar: "تعاون مع فرق التسويق والمنتج لترجمة الطلبات إلى تصاميم بصرية." },
    { en: "Reviewed and revised designs based on stakeholder feedback before final delivery.", ar: "راجع التصاميم وعدّلها بناءً على ملاحظات أصحاب المصلحة قبل التسليم النهائي." },
    { en: "Maintained an organized library of design assets, templates and fonts.", ar: "حافظ على مكتبة منظمة لأصول التصميم والقوالب والخطوط." },
    { en: "Selected typography, color palettes and imagery consistent with brand identity.", ar: "اختار الخطوط والألوان والصور بما يتسق مع الهوية البصرية." },
    { en: "Delivered design files in formats suited to each production and web requirement.", ar: "سلّم ملفات التصميم بصيغ تناسب متطلبات كل جهة إنتاج أو موقع." },
    { en: "Presented design concepts to stakeholders and incorporated revisions.", ar: "عرض مفاهيم التصميم على أصحاب المصلحة وأدمج التعديلات المطلوبة." },
  ],
  credentials: [
    { kind: "certification", title: { en: "Adobe Certified Professional", ar: "شهادة أدوبي المعتمدة" } },
    { kind: "training", title: { en: "Brand Identity Design Training", ar: "تدريب تصميم الهوية البصرية" } },
    { kind: "training", title: { en: "UI/UX Design Fundamentals", ar: "أساسيات تصميم واجهات وتجربة المستخدم" } },
    { kind: "membership", title: { en: "Graphic Design Association Membership", ar: "عضوية جمعية التصميم الجرافيكي" } },
  ],
  keywords: [
    "Graphic Design", "Photoshop", "Illustrator", "InDesign", "Figma", "Brand Identity",
    "Typography", "Print Design", "Social Media Design", "Portfolio",
    "تصميم جرافيك", "الهوية البصرية", "تصميم الشعارات", "المواد التسويقية",
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
  PHYSICIAN,
  DENTIST,
  PHYSIOTHERAPIST,
  LABORATORY_TECHNOLOGIST,
  MECHANICAL_ENGINEER,
  ELECTRICAL_ENGINEER,
  INDUSTRIAL_ENGINEER,
  AUDITOR,
  SOFTWARE_DEVELOPER,
  IT_SUPPORT,
  NETWORK_ENGINEER,
  HR_SPECIALIST,
  PROJECT_MANAGER,
  SALES_REPRESENTATIVE,
  CUSTOMER_SERVICE,
  GRAPHIC_DESIGNER,
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
