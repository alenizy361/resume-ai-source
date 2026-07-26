import { JOBS, type JobData } from "./jobs.ts";
import { JOBS_AR, type JobAr } from "./jobs-ar.ts";

/**
 * The layer between the site and 363 pages.
 *
 * ── what was missing ──
 *
 * The crawl in `docs/seo.md` found 188 indexable pages and a structure one level deep: an index
 * listing every profession, then the profession pages. A visitor who knows they work in healthcare
 * but hasn't decided which title to search for has nowhere to land, and a crawler has no signal
 * that "Radiology Technologist" and "Registered Nurse" belong together beyond a shared word in a
 * sibling list. Both problems are the same missing layer.
 *
 * ── the gate, which is the point ──
 *
 * A category page is only worth existing when there is a category behind it. Two links and a
 * heading is a thin page, and the brief this work follows bans thin auto-generated content in
 * exactly those words. So `sectorsFor(lang)` publishes a sector only when that LANGUAGE's
 * catalogue holds at least `MIN_PROFESSIONS` of them — which is why the English list is six
 * sectors and the Arabic list is nine, from the same registry. `Design` has four Arabic
 * professions and two English ones; it gets an Arabic page and no English one, and that asymmetry
 * is correct rather than a bug to paper over.
 *
 * ── and why hreflang is conditional ──
 *
 * The two catalogues are not translations of each other. They were written separately, for
 * different markets, and their category taxonomies genuinely differ — Arabic separates banking
 * from accounting and carries transport and logistics, English carries neither. An hreflang pair
 * is a claim that two pages serve one intent in two languages; declaring it for a sector that only
 * one language publishes points at a 404, and Google discards the whole cluster when it finds one.
 * So `hasBoth()` decides, per sector, and the page template asks it.
 *
 * ── the content is not the list ──
 *
 * Everything below the profession grid is either hand-written per sector or COMPUTED from the
 * catalogue: the keywords that recur across a sector's roles, and the certifications that recur.
 * That second kind is the interesting one — "these eleven terms appear in most Technology roles
 * here" is a fact about the data that no single profession page can state, and it is the reason a
 * sector page earns a visit rather than redirecting the reader down one level immediately.
 *
 * Regulator claims stay soft on purpose. Where a Saudi licence or classification is involved the
 * text names the authority and says to confirm the current requirement with them — the same line
 * the profession pages take, for the same reason: `ops/verify-rules.mjs` exists because nobody in
 * this repository has opened those websites yet.
 *
 * No `next/*` imports — `ops/sectors.test.mjs` loads this in plain Node.
 */

/** Below this, a category page is a heading and two links. */
export const MIN_PROFESSIONS = 3;

export interface SectorCopy {
  /** The category value as it appears in that language's catalogue. The join key. */
  category: string;
  /** Reader-facing sector name. Not always the category value — "Business" reads better as a name than a filter. */
  name: string;
  h1: string;
  title: string;
  description: string;
  /** Two or three paragraphs, written for this sector in this language. */
  intro: string[];
  /** What applying in this sector actually involves — the paragraph a generic hub cannot write. */
  hiring: string;
  faq: { q: string; a: string }[];
}

export interface Sector {
  /** Shared by both languages so a sector has one address per language and they mirror. */
  slug: string;
  en?: SectorCopy;
  ar?: SectorCopy;
}

export const SECTORS: Sector[] = [
  {
    slug: "technology",
    en: {
      category: "Technology",
      name: "Technology",
      h1: "Technology Resume Examples & ATS Keywords",
      title: "Technology Resume Examples & ATS Keywords (2026)",
      description: "Resume examples for engineering, data and IT roles, with the keywords applicant tracking systems scan for in each.",
      intro: [
        "Technology hiring is the most keyword-driven of any sector, and it is the one where a resume most often fails before a person reads it. A recruiting team filling a backend role filters on the stack, not on the job title: a resume that says \"full-stack developer\" and never says Node, Postgres or Docker will not surface in a search for any of them.",
        "That makes the fix concrete rather than stylistic. Name the languages, frameworks, databases and cloud platforms you have actually used, using the spelling the posting uses, and put them where a parser reads them — inside the experience lines as well as in a skills block. Every profession below lists the exact terms that matter for that role.",
      ],
      hiring: "In Saudi Arabia most technology postings are still filled through an applicant tracking system attached to a corporate portal or through a Vision 2030 programme's own recruitment site, and both index the text you submit. A designed PDF that a parser reads as one block of characters scores on nothing. Submit a single-column file, keep the headings standard, and keep a plain copy for the portals that ask you to paste rather than upload.",
      faq: [
        { q: "Should a technology resume list every language I have touched?", a: "No. A long list dilutes the terms that matter and reads as inexperience. Name the stack you can be interviewed on, and put the specific ones from the job posting first — an ATS scores overlap with the posting, not the size of your list." },
        { q: "Do I need a portfolio link on a technology resume?", a: "For engineering and data roles a repository or portfolio link is worth more than a summary paragraph, because it is the one claim on the page a reviewer can verify in thirty seconds. Put it in the contact line, not in a footer." },
        { q: "How do I show impact when the work was on an internal system?", a: "Use the numbers you are allowed to state: request volume, latency, build time, the number of teams using what you shipped, the count of incidents before and after. None of those are confidential and all of them are more specific than \"improved performance\"." },
      ],
    },
    ar: {
      category: "التقنية",
      name: "التقنية",
      h1: "أمثلة سيرة ذاتية لوظائف التقنية + كلمات ATS",
      title: "أمثلة سيرة ذاتية لوظائف التقنية وكلمات ATS (2026)",
      description: "نماذج سير ذاتية لوظائف البرمجة والبيانات وتقنية المعلومات، مع الكلمات التي تفحصها أنظمة التوظيف في كل تخصص.",
      intro: [
        "وظائف التقنية هي أكثر القطاعات ارتباطاً بالكلمات المفتاحية، وهي القطاع الذي تُستبعد فيه السيرة قبل أن يقرأها إنسان. الجهة التي توظّف مطوّر backend تبحث في نظامها عن التقنيات نفسها لا عن المسمّى الوظيفي: سيرة تقول «مطوّر full-stack» ولا تذكر Node أو Postgres أو Docker لن تظهر في أي بحث عن هذه الثلاثة.",
        "لذلك الحل عملي وليس شكلياً. اكتب اللغات والأُطر وقواعد البيانات ومنصّات السحابة التي عملت عليها فعلاً، بنفس طريقة كتابتها في الإعلان، وضعها في مكان يقرأه المحلّل الآلي — داخل أسطر الخبرة وليس في قائمة مهارات منفصلة فقط. كل مهنة في الأسفل تعرض الكلمات الدقيقة لها.",
        "ملاحظة تخص السوق المحلي: أغلب الإعلانات التقنية في السعودية تُكتب بالإنجليزية، والكلمات التقنية تُفحص بالإنجليزية حتى لو كانت سيرتك عربية. اكتب المسمّيات والتقنيات بالإنجليزية كما هي، واكتب باقي السيرة بلغة الإعلان.",
      ],
      hiring: "معظم الشواغر التقنية في السعودية تُقدَّم عبر بوابة توظيف مرتبطة بنظام ATS أو عبر منصّة برنامج من برامج رؤية 2030، وكلاهما يفهرس النص الذي ترفعه. ملف PDF مصمّم يقرأه المحلّل كتلة حروف واحدة لا يحصل على أي درجة. ارفع ملفاً بعمود واحد، بعناوين قياسية، واحتفظ بنسخة نصية للمنصّات التي تطلب لصق السيرة بدل رفعها.",
      faq: [
        { q: "هل أكتب كل لغة برمجة تعاملت معها؟", a: "لا. القائمة الطويلة تُضعِف الكلمات المهمة وتُقرأ كقلة خبرة. اكتب ما تستطيع أن تُقابَل عليه، وابدأ بما ورد في الإعلان — النظام يقيس التطابق مع الإعلان لا طول قائمتك." },
        { q: "هل أحتاج رابط أعمال في سيرة تقنية؟", a: "في وظائف البرمجة والبيانات رابط المستودع أو معرض الأعمال أهم من فقرة الملخّص، لأنه الشيء الوحيد في الصفحة الذي يستطيع المُراجِع التحقّق منه في نصف دقيقة. ضعه في سطر التواصل لا في أسفل الصفحة." },
        { q: "كيف أُظهر الأثر إذا كان العمل على نظام داخلي؟", a: "استخدم الأرقام المسموح بذكرها: حجم الطلبات، زمن الاستجابة، زمن البناء، عدد الفرق التي تستخدم ما أنجزته، عدد الأعطال قبل وبعد. كلها غير سرّية وكلها أدقّ من «تحسين الأداء»." },
      ],
    },
  },
  {
    slug: "healthcare",
    en: {
      category: "Healthcare",
      name: "Healthcare",
      h1: "Healthcare Resume Examples & ATS Keywords",
      title: "Healthcare Resume Examples & ATS Keywords (2026)",
      description: "Resume examples for clinical and allied-health roles, with the credentials and keywords hospital recruiters filter on.",
      intro: [
        "A healthcare resume is screened on credentials before it is read for experience. Hospital recruiting systems filter on licence status, on the life-support certificates the role requires, and on the clinical systems the department runs — and a resume that leaves any of those implicit is filtered out while being entirely truthful.",
        "So the order matters. Put the licence and the certificates where they are found immediately, name the EMR or PACS system rather than writing \"electronic records\", and describe volume: patients per shift, cases per week, the unit you covered. Every profession below lists the credentials and terms that appear most often in postings for that role.",
      ],
      hiring: "For clinical work in Saudi Arabia the question employers ask first is your professional classification with the Saudi Commission for Health Specialties, and it is a separate matter from any certificate on your CV. Requirements differ by profession and by grade and they change; check the current one with the commission directly rather than relying on a job advert or on this page. A foreign licence is worth listing where you actually hold it — it does not substitute for the local classification.",
      faq: [
        { q: "Should a healthcare resume include a licence number?", a: "List the licence and its issuing body, and add the number only if the employer asks for it. It belongs in a credentials section, not in the contact line — a long digit run in a header gets parsed as a phone number and displaces the one a recruiter needs to call." },
        { q: "Which certificates matter most on a clinical resume?", a: "The ones the posting names, and the current life-support certificates for your role. An expired BLS or ACLS on a resume is worse than none, because the date is the first thing a credentialing officer checks." },
        { q: "How do I show clinical volume without breaching patient privacy?", a: "Volume and setting are not patient information. \"Up to 8 acute patients per shift on a 24-bed medical unit\" identifies nobody and tells a hiring manager more than any adjective would." },
      ],
    },
    ar: {
      category: "الصحة",
      name: "القطاع الصحي",
      h1: "أمثلة سيرة ذاتية للقطاع الصحي + كلمات ATS",
      title: "أمثلة سيرة ذاتية للقطاع الصحي وكلمات ATS (2026)",
      description: "نماذج سير ذاتية للوظائف الصحية والتخصصات المساندة، مع الاعتمادات والكلمات التي تفحصها أنظمة التوظيف في المستشفيات.",
      intro: [
        "السيرة الذاتية في القطاع الصحي تُفحَص على الاعتمادات قبل أن تُقرأ على الخبرة. أنظمة التوظيف في المستشفيات تُرشِّح على حالة التصنيف المهني، وعلى شهادات الإنعاش التي تتطلّبها الوظيفة، وعلى الأنظمة السريرية التي يستخدمها القسم — وسيرة تترك أياً من هذه ضمنياً تُستبعد وهي صادقة تماماً.",
        "لذلك الترتيب مهم. ضع التصنيف والشهادات في مكان يُرى فوراً، واكتب اسم نظام السجلات الطبية أو نظام الأشعة بالتحديد بدل عبارة «السجلات الإلكترونية»، وذكر الحجم: عدد المرضى في الوردية، عدد الحالات أسبوعياً، القسم الذي غطّيته. كل مهنة في الأسفل تعرض الاعتمادات والكلمات الأكثر تكراراً في إعلاناتها.",
      ],
      hiring: "أول سؤال تسأله الجهات الصحية في السعودية هو تصنيفك المهني في الهيئة السعودية للتخصصات الصحية، وهو أمر منفصل عن أي شهادة في سيرتك. الاشتراطات تختلف بحسب التخصص والدرجة وتتغيّر؛ تحقّق من الاشتراط الحالي من الهيئة مباشرة لا من إعلان وظيفة ولا من هذه الصفحة. الترخيص الأجنبي يُذكر حيث تحمله فعلاً — وهو لا يُغني عن التصنيف المحلي.",
      faq: [
        { q: "هل أكتب رقم الترخيص في السيرة الصحية؟", a: "اكتب الترخيص والجهة المُصدِرة، وأضف الرقم إذا طلبته الجهة. مكانه قسم الاعتمادات لا سطر التواصل — سلسلة أرقام طويلة في الترويسة يقرأها المحلّل الآلي رقم هاتف فيُزيح الرقم الذي يحتاجه المسؤول للاتصال بك." },
        { q: "أي الشهادات أهم في السيرة السريرية؟", a: "التي يذكرها الإعلان، وشهادات الإنعاش السارية لتخصصك. شهادة BLS أو ACLS منتهية أسوأ من عدم ذكرها، لأن التاريخ أول ما يفحصه مسؤول الاعتماد." },
        { q: "كيف أُظهر حجم العمل السريري دون المساس بخصوصية المرضى؟", a: "الحجم ونوع القسم ليست معلومات مرضى. «حتى ٨ مرضى حِدّة في الوردية في قسم باطنة بـ٢٤ سريراً» لا تُعرِّف أحداً وتقول لمدير التوظيف أكثر من أي وصف إنشائي." },
      ],
    },
  },
  {
    slug: "engineering",
    en: {
      category: "Engineering",
      name: "Engineering",
      h1: "Engineering Resume Examples & ATS Keywords",
      title: "Engineering Resume Examples & ATS Keywords (2026)",
      description: "Resume examples for civil, mechanical, electrical and industrial engineering roles, with the standards and software recruiters filter on.",
      intro: [
        "Engineering resumes are read for two things a general template does not have room for: the codes and standards you have worked to, and the scale of what you delivered. A discipline lead scanning fifty applications is looking for the standard their project runs on and for a project size close to their own.",
        "So state both. Name the standards and the design software rather than describing them, and give each project a size — contract value, capacity, area, tonnage, whichever unit your discipline actually uses. Every profession below lists the terms that recur in postings for that role.",
      ],
      hiring: "Engineering roles in Saudi Arabia routinely ask for membership or accreditation with the Saudi Council of Engineers, and for large projects the client's own prequalification adds requirements on top. Both are decided by those bodies and not by a job advert, so confirm the current requirement with them before you build a claim on it. What belongs on the resume is the membership you hold, named exactly, with the grade if you have one.",
      faq: [
        { q: "Should an engineering resume list projects or employers first?", a: "Employers, with projects nested under each. A flat project list loses the reporting line and the duration, and both are what a reviewer uses to judge the level you actually worked at." },
        { q: "How much detail do drawings and software deserve?", a: "Name the software you can be tested on and the version families you know, once. Then spend the space on what you produced with it — a design that was built, a submission that was approved, a defect rate that fell." },
        { q: "Do I include a graduation project?", a: "Only in your first two years, and only if it used the same standards or software as the role. After that it displaces work someone paid for." },
      ],
    },
    ar: {
      category: "الهندسة",
      name: "الهندسة",
      h1: "أمثلة سيرة ذاتية هندسية + كلمات ATS",
      title: "أمثلة سيرة ذاتية هندسية وكلمات ATS (2026)",
      description: "نماذج سير ذاتية لوظائف الهندسة المدنية والميكانيكية والكهربائية والصناعية، مع الأكواد والبرامج التي تُفحَص عليها.",
      intro: [
        "السيرة الهندسية تُقرأ على أمرين لا يتّسع لهما القالب العام: الأكواد والمواصفات التي عملت بها، وحجم ما نفّذته. رئيس التخصص الذي يراجع خمسين طلباً يبحث عن الكود الذي يعمل به مشروعه وعن حجم مشروع قريب من حجم مشروعه.",
        "اذكر الاثنين إذاً. اكتب أسماء المواصفات وبرامج التصميم بدل وصفها، وأعطِ كل مشروع حجماً — قيمة العقد، الطاقة الاستيعابية، المساحة، الأطنان، أي وحدة يستخدمها تخصّصك فعلاً. كل مهنة في الأسفل تعرض الكلمات المتكرّرة في إعلاناتها.",
        "وهناك بند يُغفَل في كل السير الهندسية تقريباً: السلامة. أي تخصّص يعمل في موقع تنفيذ يُسأل عن سجلّه في السلامة قبل أن يُسأل عن تصميمه، ومع ذلك تخلو أغلب السير من رقم واحد عنها. اكتب ساعات العمل بلا حوادث، أو عدد التفتيشات التي قدتها، أو الشهادة التي تحملها وتاريخ صلاحيتها — سطر واحد يميّزك عن عشرين متقدّماً كتبوا نفس البرامج ونفس الأكواد.",
      ],
      hiring: "الوظائف الهندسية في السعودية تطلب عادةً العضوية أو الاعتماد في الهيئة السعودية للمهندسين، ومشاريع الجهات الكبيرة تضيف اشتراطات تأهيل خاصة بها. الأمران تحدّدهما تلك الجهات لا إعلان الوظيفة، فتحقّق من الاشتراط الحالي منها قبل أن تبني عليه. ما يُكتب في السيرة هو العضوية التي تحملها فعلاً، باسمها الدقيق، ومع درجتها إن وُجدت.",
      faq: [
        { q: "أبدأ بالجهات أم بالمشاريع في السيرة الهندسية؟", a: "بالجهات، وتحت كل جهة مشاريعها. قائمة مشاريع مسطّحة تُفقد التبعية الإدارية والمدّة، وهما ما يستخدمه المُراجِع لتقدير المستوى الذي عملت فيه فعلاً." },
        { q: "كم تفصيلاً تستحق البرامج والمخططات؟", a: "اكتب البرامج التي تستطيع أن تُختبر عليها ونطاق الإصدارات التي تعرفها، مرة واحدة. ثم اصرف المساحة على ما أنتجته بها — تصميم نُفِّذ، اعتماد صدر، نسبة ملاحظات انخفضت." },
        { q: "هل أذكر مشروع التخرّج؟", a: "في أول سنتين فقط، وفقط إذا استخدم نفس المواصفات أو البرامج المطلوبة. بعدها يُزيح عملاً دفع أحدٌ مقابله." },
      ],
    },
  },
  {
    slug: "business",
    en: {
      category: "Business",
      name: "Business & Operations",
      h1: "Business & Operations Resume Examples",
      title: "Business & Operations Resume Examples (2026)",
      description: "Resume examples for management, analysis, HR and operations roles, with the keywords hiring systems scan for in each.",
      intro: [
        "Business roles produce the vaguest resumes on this site, and the reason is structural: the work is coordination, and coordination has no artefact. So the resume fills with responsibility language — \"responsible for stakeholder management\" — which describes a job title rather than a person doing it.",
        "The correction is arithmetic. Every business role has numbers attached to it: budget, headcount, cycle time, contract value, number of sites, percentage delivered on time. Put those in the bullets and the same sentence stops being interchangeable with everyone else's. The professions below list the terms each role is actually filtered on.",
      ],
      hiring: "Saudi employers hiring for business roles usually screen against a job description written in English even when the interview is in Arabic, and Saudisation targets mean nationality and, for many postings, a Qiwa or Absher-verified employment history are part of the file. Keep dates continuous and consistent with your official record — a gap you can explain is fine, a gap that contradicts a verified history is not.",
      faq: [
        { q: "What replaces \"responsible for\" on a business resume?", a: "A verb plus a number. \"Ran a SAR 4M category across 6 sites\" and \"cut approval time from 9 days to 4\" carry the same information as a responsibility line plus the only part a reader remembers." },
        { q: "Should I list the frameworks and methodologies I know?", a: "List certifications by their exact name and the methodologies you have actually worked in. A framework you read about adds a keyword and removes credibility in the interview it earns you." },
        { q: "How do I present a promotion within one employer?", a: "As one employer with two titles and two date ranges nested under it. Split into two blocks and a parser reads two jobs, which is the most common way a strong internal progression is turned into apparent job-hopping." },
      ],
    },
    ar: {
      category: "الإدارة",
      name: "الإدارة والأعمال",
      h1: "أمثلة سيرة ذاتية إدارية + كلمات ATS",
      title: "أمثلة سيرة ذاتية إدارية وكلمات ATS (2026)",
      description: "نماذج سير ذاتية للوظائف الإدارية والتشغيلية والمشتريات، مع الكلمات التي تفحصها أنظمة التوظيف في كل تخصص.",
      intro: [
        "الوظائف الإدارية تُنتج أكثر السير غموضاً، والسبب بنيوي: العمل تنسيق، والتنسيق ليس له مُخرَج ملموس. فتمتلئ السيرة بلغة المسؤوليات — «مسؤول عن إدارة أصحاب المصلحة» — وهي تصف مسمّى وظيفياً لا شخصاً يعمل فيه.",
        "التصحيح حسابي. كل وظيفة إدارية لها أرقام: الميزانية، عدد الموظفين، مدة الدورة، قيمة العقود، عدد الفروع، نسبة الإنجاز في الوقت. ضع هذه في الأسطر فتتوقّف الجملة عن كونها قابلة للتبديل مع جملة أي متقدّم آخر. المهن في الأسفل تعرض الكلمات التي تُفحَص عليها كل وظيفة.",
        "وأضِف نطاق الصلاحية، لا المسمّى وحده. «منسّق» في جهة تعني ما يعنيه «مدير» في جهة أخرى، والمُراجِع لا يعرف أيّهما أنت إلا إذا كتبت لمن ترفع تقاريرك ومن يرفع لك وما القرار الذي كنت تتّخذه دون موافقة أحد. ثلاثة أسطر تحسم مستوى الوظيفة التي ستُرشَّح لها.",
      ],
      hiring: "الجهات السعودية في الوظائف الإدارية تُرشِّح عادةً مقابل وصف وظيفي مكتوب بالإنجليزية حتى لو كانت المقابلة بالعربية، ومستهدفات السعودة تجعل الجنسية — وفي كثير من الإعلانات سجلاً وظيفياً موثّقاً في قوى أو أبشر — جزءاً من الملف. اجعل التواريخ متّصلة ومتوافقة مع سجلك الرسمي؛ الفراغ الذي تستطيع تفسيره مقبول، والفراغ الذي يخالف سجلاً موثّقاً غير مقبول.",
      faq: [
        { q: "بماذا أستبدل «مسؤول عن» في السيرة الإدارية؟", a: "بفعل ورقم. «أدرت فئة مشتريات بـ٤ ملايين ريال في ٦ فروع» و«خفّضت زمن الاعتماد من ٩ أيام إلى ٤» تحملان نفس معلومة سطر المسؤولية زائد الجزء الوحيد الذي يتذكّره القارئ." },
        { q: "هل أكتب المنهجيات والأُطر التي أعرفها؟", a: "اكتب الشهادات بأسمائها الدقيقة والمنهجيات التي عملت بها فعلاً. منهجية قرأت عنها تضيف كلمة مفتاحية وتُسقِط مصداقيتك في المقابلة التي جلبتها لك." },
        { q: "كيف أعرض ترقية داخل نفس الجهة؟", a: "جهة واحدة تحتها مسمّيان ونطاقان زمنيان. إذا فصلتهما إلى كتلتين قرأهما المحلّل الآلي وظيفتين، وهذه أشهر طريقة يتحوّل بها تدرّج داخلي قوي إلى ما يشبه التنقّل الكثير بين الوظائف." },
      ],
    },
  },
  {
    slug: "finance",
    en: {
      category: "Finance",
      name: "Finance & Accounting",
      h1: "Finance & Accounting Resume Examples",
      title: "Finance & Accounting Resume Examples (2026)",
      description: "Resume examples for accounting, audit and finance roles, with the standards, systems and keywords recruiters filter on.",
      intro: [
        "Finance resumes are screened on three things at once: the reporting standard you work under, the system you work in, and the size of what you were trusted with. All three are usually missing, replaced by a list of duties that every accountant shares.",
        "State the standard by name, state the ERP by name, and attach a figure to the scope — revenue closed, accounts reconciled, entities consolidated, the length of the close. The professions below list the exact terms each finance role is filtered on.",
      ],
      hiring: "In Saudi Arabia finance postings assume familiarity with VAT and Zakat filing and with the reporting framework the entity uses, and professional membership is often listed as a requirement rather than a preference. Where a Saudi licence or membership is involved — SOCPA for accountants, for instance — the requirement is set by that body and changes; confirm it with them and list only what you actually hold.",
      faq: [
        { q: "Which is worth more on a finance resume, the standard or the software?", a: "Both, and they cost one line each. The standard tells a reviewer whether your experience transfers; the software tells them how long onboarding takes. Leaving either out makes the other harder to evaluate." },
        { q: "How do I quantify accounting work that has no revenue attached?", a: "Use the volumes you own: number of accounts reconciled, invoices processed per month, entities consolidated, days to close, value of a recovery or a saving you can evidence." },
        { q: "Should I list every ERP module I have used?", a: "Name the system and the modules you worked in, not every screen you have opened. Depth in one module is more employable than a list, and it survives a technical question." },
      ],
    },
    ar: {
      category: "المالية والمحاسبة",
      name: "المالية والمحاسبة",
      h1: "أمثلة سيرة ذاتية مالية ومحاسبية + كلمات ATS",
      title: "أمثلة سيرة ذاتية مالية ومحاسبية وكلمات ATS (2026)",
      description: "نماذج سير ذاتية لوظائف المحاسبة والمراجعة والمالية، مع المعايير والأنظمة والكلمات التي تُفحَص عليها.",
      intro: [
        "السيرة المالية تُفحَص على ثلاثة أمور معاً: معيار التقارير الذي تعمل به، والنظام الذي تعمل داخله، وحجم ما أُوكِل إليك. الثلاثة غائبة عادةً، ومكانها قائمة مهام يشترك فيها كل محاسب.",
        "اكتب اسم المعيار، واكتب اسم نظام ERP، وألصِق رقماً بالنطاق — الإيراد الذي أقفلته، عدد الحسابات التي طابقتها، عدد الشركات التي وحّدتها، مدة الإقفال. المهن في الأسفل تعرض الكلمات الدقيقة التي تُفحَص عليها كل وظيفة مالية.",
        "وثمّة فرق يُخلَط دائماً بين المحاسبة والمالية، وهو يقرّر أي وظيفة تُرشَّح لها: المحاسبة تسجّل ما حدث، والمالية تُقدّر ما سيحدث. إذا كانت خبرتك في الإقفال والمطابقة والإفصاح فأنت في الأولى، وإذا كانت في التنبؤ والموازنات وتحليل الجدوى فأنت في الثانية. سيرة تخلط الاثنين تبدو أوسع وتُقرأ أضعف، لأن مسؤول التوظيف يبحث عن أحدهما بالتحديد.",
      ],
      hiring: "الإعلانات المالية في السعودية تفترض معرفةً بضريبة القيمة المضافة والزكاة وبإطار التقارير الذي تستخدمه الجهة، والعضوية المهنية تُذكر كثيراً كاشتراط لا كتفضيل. وحيث يدخل ترخيص أو عضوية سعودية — الهيئة السعودية للمراجعين والمحاسبين مثلاً — فالاشتراط تحدّده تلك الجهة ويتغيّر؛ تحقّق منه منها واكتب ما تحمله فعلاً فقط.",
      faq: [
        { q: "أيّهما أهم في السيرة المالية، المعيار أم البرنامج؟", a: "كلاهما، وكل واحد يكلّفك سطراً. المعيار يخبر المُراجِع إن كانت خبرتك تنتقل، والبرنامج يخبره كم يطول تأهيلك. حذف أحدهما يجعل تقييم الآخر أصعب." },
        { q: "كيف أُرقّم عملاً محاسبياً لا إيراد مرتبط به؟", a: "استخدم الأحجام التي تملكها: عدد الحسابات المطابَقة، الفواتير شهرياً، الشركات المُوحَّدة، أيام الإقفال، قيمة استرداد أو توفير تستطيع إثباته." },
        { q: "هل أكتب كل وحدات ERP التي استخدمتها؟", a: "اكتب النظام والوحدات التي عملت فيها، لا كل شاشة فتحتها. العمق في وحدة واحدة أكثر قابلية للتوظيف من قائمة، وهو ما يصمد أمام سؤال فني." },
      ],
    },
  },
  {
    slug: "marketing",
    en: {
      category: "Marketing",
      name: "Marketing & Sales",
      h1: "Marketing & Sales Resume Examples",
      title: "Marketing & Sales Resume Examples (2026)",
      description: "Resume examples for marketing, digital and sales roles, with the channels, platforms and keywords recruiters scan for.",
      intro: [
        "Marketing is the sector where a resume is most often judged against its own subject: a page that cannot state a result is an unconvincing pitch for someone whose job is stating results. And it is the easiest sector in which to write a number, because every channel reports one.",
        "So use them. Spend, reach, cost per acquisition, conversion rate, pipeline, retention — with the baseline, because a 40% lift means nothing without what it lifted from. The professions below list the platforms and terms each role is filtered on.",
      ],
      hiring: "Marketing and sales hiring in the Gulf leans on Arabic-and-English capability as a stated requirement, and on evidence you have run campaigns for this audience rather than translated one. If your work was bilingual, say which language each campaign ran in — it is a differentiator that most applicants leave implicit.",
      faq: [
        { q: "What if I cannot disclose the spend I managed?", a: "Use a range or an order of magnitude, and name the channel and the period. \"Managed a six-figure SAR paid-social budget across two quarters\" is disclosable and still tells a reader the level you operated at." },
        { q: "Do certifications from platforms count?", a: "They are worth a line each and no more. They demonstrate current tooling, which matters, and they are not experience — a reviewer discounts a list of them that is longer than the results section." },
        { q: "Should a marketing resume be visually designed?", a: "Keep the file a parser can read and put the design in a portfolio you link to. A designed resume that scores zero in an ATS never reaches the person who would have appreciated the design." },
      ],
    },
    ar: {
      category: "التسويق والمبيعات",
      name: "التسويق والمبيعات",
      h1: "أمثلة سيرة ذاتية للتسويق والمبيعات + كلمات ATS",
      title: "أمثلة سيرة ذاتية للتسويق والمبيعات وكلمات ATS (2026)",
      description: "نماذج سير ذاتية لوظائف التسويق والتسويق الرقمي والمبيعات، مع القنوات والمنصّات والكلمات التي تُفحَص عليها.",
      intro: [
        "التسويق هو القطاع الذي تُحاكَم فيه السيرة بمعيار موضوعها نفسه: صفحة لا تستطيع ذكر نتيجة هي عرضٌ غير مقنع لشخص مهمّته ذكر النتائج. وهو أسهل قطاع في كتابة رقم، لأن كل قناة تُخرج رقماً.",
        "استخدمها إذاً. الميزانية، الوصول، تكلفة الاستحواذ، نسبة التحويل، خطّ الفرص، الاحتفاظ — مع نقطة البداية، لأن ارتفاعاً بـ٤٠٪ لا يعني شيئاً دون معرفة ما ارتفع عنه. المهن في الأسفل تعرض المنصّات والكلمات التي تُفحَص عليها كل وظيفة.",
        "واحسم موقعك على خطّ واحد: هل أنت في أعلى القمع أم في أسفله؟ من يعمل على الوعي والمحتوى يُقاس بالوصول والتفاعل، ومن يعمل على الأداء والمبيعات يُقاس بالتكلفة والإيراد. اكتب أيّهما كنت، وبأي قناة، وبأي حجم فريق — فسيرة تدّعي القمع كله تُقرأ كسيرة لا تملك رقماً في أي جزء منه.",
      ],
      hiring: "التوظيف في التسويق والمبيعات في الخليج يعتمد على القدرة بالعربية والإنجليزية كاشتراط معلن، وعلى دليل أنك أدرت حملات لهذا الجمهور لا حملات مترجَمة. إذا كان عملك بلغتين فاذكر لغة كل حملة — وهي ميزة يتركها معظم المتقدّمين ضمنية.",
      faq: [
        { q: "ماذا أفعل إذا لم أستطع الإفصاح عن الميزانية؟", a: "استخدم نطاقاً أو رتبة حجم، واذكر القناة والفترة. «أدرت ميزانية إعلانات اجتماعية بستة أرقام بالريال على مدى ربعين» قابلة للإفصاح وتقول للقارئ المستوى الذي عملت فيه." },
        { q: "هل شهادات المنصّات تُحتسب؟", a: "تستحق سطراً واحداً لكل واحدة ولا أكثر. تُظهر إلمامك بالأدوات الحالية وهذا مهم، وهي ليست خبرة — والمُراجِع يخصم من قائمة شهادات أطول من قسم النتائج." },
        { q: "هل تكون سيرة التسويق مصمَّمة بصرياً؟", a: "اجعل الملف قابلاً لقراءة المحلّل الآلي، وضع التصميم في معرض أعمال تربطه. سيرة مصمَّمة تحصل على صفر في نظام التوظيف لا تصل أبداً إلى الشخص الذي كان سيُقدّر التصميم." },
      ],
    },
  },
  {
    slug: "design-media",
    ar: {
      category: "الإعلام والتصميم",
      name: "الإعلام والتصميم",
      h1: "أمثلة سيرة ذاتية للإعلام والتصميم + كلمات ATS",
      title: "أمثلة سيرة ذاتية للإعلام والتصميم وكلمات ATS (2026)",
      description: "نماذج سير ذاتية لوظائف التصميم والمحتوى والإعلام، مع البرامج والكلمات التي تُفحَص عليها وطريقة عرض معرض الأعمال.",
      intro: [
        "في الإعلام والتصميم يوجد خطر مزدوج: السيرة تُصمَّم فتفشل في نظام التوظيف، أو تُكتب نصاً بسيطاً فلا تُثبت شيئاً. المخرج أن يكون لديك ملفان لهما وظيفتان مختلفتان — ملف نصي بعمود واحد يمرّ في النظام ويقود إلى معرض أعمال هو الدليل الحقيقي.",
        "ورابط المعرض ليس تفصيلاً في الأسفل. ضعه في سطر التواصل، واذكر تحت كل عمل ما كان دورك بالتحديد وما كانت النتيجة — «هوية كاملة لعلامة أُطلقت في ١٢ فرعاً» أوضح من «تصميم هويات».",
        "وفي هذا القطاع تحديداً يُفحَص المتقدّم على شيء لا يظهر في السيرة أبداً: كيف يستقبل الملاحظات. لا تستطيع كتابة ذلك كصفة، لكنك تستطيع إظهاره برقم — عدد دورات المراجعة في مشروع، أو مدّة التسليم من الإيجاز إلى النسخة النهائية، أو أنك عملت داخل دليل هوية لجهة كبيرة بقيوده. هذه إشارات إلى مصمّم يعمل في فريق لا مصمّم يعمل وحده.",
      ],
      hiring: "الجهات في السعودية تطلب في هذه الوظائف عملاً موجَّهاً للجمهور المحلي وقدرةً على التعامل مع النص العربي طباعياً — وهي مهارة تقنية حقيقية لا تُذكر عادةً. إذا أنجزت تنسيقاً عربياً أو خطوطاً عربية فاكتب ذلك صريحاً؛ قليل من المتقدّمين يفعل.",
      faq: [
        { q: "هل أرفع سيرتي كملف مصمَّم؟", a: "لا للنظام، نعم للإنسان. ارفع ملفاً نصياً بعمود واحد في البوابة، واحمل النسخة المصمَّمة إلى المقابلة أو اربطها من معرض الأعمال." },
        { q: "كم عملاً أعرض في المعرض؟", a: "من ٤ إلى ٦ أعمال كاملة أفضل من عشرين مصغّرة. المُراجِع يفتح أول عملين فقط، فاجعلهما أقرب عمل إلى الوظيفة المُعلن عنها." },
        { q: "ماذا أكتب إذا كان العمل جماعياً؟", a: "اكتب دورك بدقة وحجم الفريق. نسبة عمل فريق لنفسك يكشفها سؤال واحد في المقابلة، وذكر الدور الحقيقي في فريق كبير ليس نقطة ضعف." },
      ],
    },
  },
  {
    slug: "logistics",
    ar: {
      category: "النقل واللوجستيات",
      name: "النقل واللوجستيات",
      h1: "أمثلة سيرة ذاتية للنقل واللوجستيات + كلمات ATS",
      title: "أمثلة سيرة ذاتية للنقل واللوجستيات وكلمات ATS (2026)",
      description: "نماذج سير ذاتية لوظائف سلاسل الإمداد والمستودعات والنقل، مع الأنظمة والكلمات والاعتمادات التي تُفحَص عليها.",
      intro: [
        "اللوجستيات قطاع يُقاس بالأرقام أصلاً، ومع ذلك تُكتب سيرته بلغة مهام. كل وظيفة فيه لها مقاييس جاهزة: دقة المخزون، نسبة التسليم في الوقت، دوران المخزون، تكلفة الشحنة، عدد الطلبات في اليوم. غياب هذه الأرقام من السيرة هو غياب المهنة نفسها.",
        "واذكر النظام باسمه — نظام إدارة المستودعات أو وحدة ERP التي عملت عليها — وحجم الموقع الذي غطّيته. المهن في الأسفل تعرض الكلمات التي تُفحَص عليها كل وظيفة.",
        "وحدّد موقعك في السلسلة، فهي كلمة تشمل أعمالاً مختلفة تماماً: التخطيط والتنبؤ بالطلب شيء، والشراء والتوريد شيء، وتشغيل المستودع والتوزيع شيء ثالث. كل واحد منها له نظامه ومقاييسه ومسؤول توظيف مختلف يبحث عنه. اكتب الحلقة التي عملت فيها فعلاً وحجمها، ثم اذكر الحلقات المجاورة التي تعاملت معها — هذا أصدق وأنفع من كلمة «سلاسل إمداد» وحدها.",
      ],
      hiring: "نمو القطاع في السعودية مرتبط بمشاريع الربط اللوجستي والميناء والمناطق الصناعية، والإعلانات تطلب عادةً خبرة بأنظمة التخليص والاستيراد ورخصةً سارية حين تكون الوظيفة ميدانية. اكتب الرخص التي تحملها واسم الجهة المُصدِرة، ولا تفترض قبول رخصة صادرة من خارج المملكة دون التحقّق من الجهة المختصة.",
      faq: [
        { q: "ما أهم رقم في سيرة لوجستية؟", a: "الرقم الذي كنت مسؤولاً عنه فعلاً. دقة المخزون ونسبة التسليم في الوقت هما الأكثر طلباً، ويجب أن تعرف كيف كانا قبل عملك وكيف صارا بعده." },
        { q: "هل أذكر أنظمة إدارة المستودعات بالاسم؟", a: "نعم، ودائماً. الجهات تُرشِّح على اسم النظام لأنه يحدّد مدة تأهيلك، وهذه من أكثر الكلمات المفتاحية حسماً في القطاع." },
        { q: "كيف أعرض العمل الميداني والمكتبي معاً؟", a: "افصل بينهما داخل نفس الوظيفة: سطر أو سطران للتشغيل الميداني وحجمه، ثم أسطر التحليل والتقارير. الخلط بينهما يُخفي أيّهما تُجيد." },
      ],
    },
  },
  {
    slug: "hospitality",
    ar: {
      category: "الضيافة والسياحة",
      name: "الضيافة والسياحة",
      h1: "أمثلة سيرة ذاتية للضيافة والسياحة + كلمات ATS",
      title: "أمثلة سيرة ذاتية للضيافة والسياحة وكلمات ATS (2026)",
      description: "نماذج سير ذاتية لوظائف الفنادق والضيافة والسياحة، مع الأنظمة واللغات والكلمات التي تُفحَص عليها.",
      intro: [
        "الضيافة من أسرع القطاعات نمواً في السعودية، وسيرها الذاتية من أكثرها تشابهاً: عبارات عن «خدمة العميل» و«العمل تحت الضغط» تصلح لأي متقدّم. ما يميّز السيرة هو الحجم والنظام واللغة — عدد الغرف أو المقاعد، نظام الحجوزات أو نقاط البيع الذي تعمل عليه، واللغات التي تخدم بها فعلاً.",
        "وأضف مقياساً واحداً على الأقل من مقاييس القطاع: تقييم الضيوف، نسبة الإشغال في نطاق مسؤوليتك، متوسط قيمة الطلب، زمن الاستجابة للشكوى. المهن في الأسفل تعرض الكلمات التي تُفحَص عليها كل وظيفة.",
        "واذكر فئة المكان الذي عملت فيه، لأنها تُقرأ كمستوى: خمس نجوم أو أربع، سلسلة عالمية أو مشغّل محلي، مطعم مستقل أو علامة متعدّدة الفروع. مسؤول التوظيف في فندق كبير يقدّر أن من عمل في معايير سلسلة عالمية يعرف الإجراءات المكتوبة، ومن عمل في مكان مستقل يعرف أن يتصرّف دون إجراء. الاثنان ميزة — والمشكلة أن تكتب سيرة لا تُبيّن أيّهما أنت.",
      ],
      hiring: "التوسّع مرتبط بمشاريع السياحة الكبرى والموسم، والإعلانات تطلب اللغات صريحاً وتطلب في كثير من الوظائف شهادات سلامة غذاء أو صحة مهنية سارية. اكتب اللغات بمستوى واقعي — «تعامل مع الضيوف بالإنجليزية يومياً» أصدق وأنفع من كلمة «ممتاز» — واكتب الشهادات بتواريخ صلاحيتها.",
      faq: [
        { q: "كيف أكتب مستوى اللغة في سيرة الضيافة؟", a: "بالاستخدام لا بالوصف: بأي لغة تستقبل الضيف، وبأي لغة تكتب التقارير، وبأي لغة تتعامل مع الشكاوى. المقابلة ستختبر ما تكتبه فوراً في هذا القطاع." },
        { q: "هل الخبرة الموسمية تُضعِف السيرة؟", a: "لا إذا كُتبت كموسم. اكتب المدة وطبيعتها وحجم الموقع؛ الفراغ غير المفسَّر بين المواسم هو المشكلة، لا الموسم نفسه." },
        { q: "ما الرقم الذي يُلاحظه مدير الفندق؟", a: "تقييم الضيوف ونسبة الإشغال ومتوسط الفاتورة، ثم عدد أفراد الفريق الذي أشرفت عليه. هذه أربعة أرقام تحوّل سيرة عامة إلى سيرة مُقنِعة." },
      ],
    },
  },
];

/* ─────────────────── lookups ─────────────────── */

export type Lang = "ar" | "en";

export const copyFor = (s: Sector, lang: Lang): SectorCopy | undefined => (lang === "ar" ? s.ar : s.en);

/** The professions this sector holds in one language's catalogue. */
export function professions(slug: string, lang: "en"): JobData[];
export function professions(slug: string, lang: "ar"): JobAr[];
export function professions(slug: string, lang: Lang): (JobData | JobAr)[] {
  const sector = SECTORS.find((s) => s.slug === slug);
  const copy = sector && copyFor(sector, lang);
  if (!copy) return [];
  return lang === "ar"
    ? JOBS_AR.filter((j) => j.category === copy.category)
    : JOBS.filter((j) => j.category === copy.category);
}

/**
 * Sectors with a page in this language.
 *
 * The count is taken from the catalogue rather than declared in the registry, so adding a
 * profession can publish a sector and removing one can retire it — without a second place to
 * update and forget.
 */
export function sectorsFor(lang: Lang): Sector[] {
  return SECTORS.filter((s) => {
    if (!copyFor(s, lang)) return false;
    const n = lang === "ar" ? professions(s.slug, "ar").length : professions(s.slug, "en").length;
    return n >= MIN_PROFESSIONS;
  });
}

export const sectorSlugs = (lang: Lang) => sectorsFor(lang).map((s) => s.slug);

export const getSector = (slug: string, lang: Lang): Sector | undefined =>
  sectorsFor(lang).find((s) => s.slug === slug);

/**
 * The published sector a profession belongs to, or undefined.
 *
 * Used by the profession pages to link UP. Undefined is a normal answer, not an error: the single
 * English education profession has no sector page to link to, and inventing one for it is exactly
 * what `MIN_PROFESSIONS` exists to prevent.
 */
export const sectorForCategory = (category: string, lang: Lang): Sector | undefined =>
  sectorsFor(lang).find((s) => copyFor(s, lang)!.category === category);

/** True only when BOTH languages publish this sector — the precondition for an hreflang pair. */
export const hasBoth = (slug: string): boolean =>
  Boolean(getSector(slug, "en")) && Boolean(getSector(slug, "ar"));

/* ─────────────────── computed content ─────────────────── */

function tally(lists: string[][]): { term: string; count: number }[] {
  const seen = new Map<string, { term: string; count: number }>();
  for (const list of lists) {
    /* Within one profession a term counts once, however many times it is written. */
    for (const term of new Set(list.map((t) => t.trim()).filter(Boolean))) {
      const key = term.toLowerCase();
      const hit = seen.get(key);
      if (hit) hit.count += 1;
      else seen.set(key, { term, count: 1 });
    }
  }
  return [...seen.values()].sort((a, b) => b.count - a.count || a.term.localeCompare(b.term));
}

/**
 * The ATS terms that recur across a sector — the one thing a sector page knows that none of its
 * profession pages can say.
 *
 * `min: 2` is not arbitrary: a term appearing in a single profession is that profession's keyword
 * and belongs on its page, not on a page claiming to describe a sector.
 */
export function sharedKeywords(slug: string, lang: Lang, min = 2): { term: string; count: number }[] {
  const lists = lang === "ar"
    ? professions(slug, "ar").map((j) => j.keywords)
    : professions(slug, "en").map((j) => j.atsKeywords);
  return tally(lists).filter((t) => t.count >= min);
}

/** Certifications named by more than one profession in the sector. Same rule, same reason. */
export function sharedCerts(slug: string, lang: Lang, min = 2): { term: string; count: number }[] {
  const lists = lang === "ar"
    ? professions(slug, "ar").map((j) => j.certs)
    : professions(slug, "en").map((j) => j.certs);
  return tally(lists).filter((t) => t.count >= min);
}
