/**
 * Grade 10 (SEE) syllabus for the local test child (scripts/seed-test-child.ts).
 *
 * Confidence and difficulty follow the testing scenario: Science, both
 * Mathematics and Computer Science are the weak, hard subjects; English and
 * Nepali the easy ones; the rest in between. A topic with `subtopics` is a
 * parent: only its sub-topics are scheduled, as in the app.
 */
export type Level = 'low' | 'medium' | 'high';

export interface SeedTopic {
  name: string;
  /** 1-5; 4 or more counts as a hard topic (at most 2 a day). */
  difficulty?: number;
  subtopics?: SeedTopic[];
}

export interface SeedSubject {
  name: string;
  /** The parent's gut-sense confidence (no marks yet). */
  confidence: Level;
  examWeight: Level;
  /** Difficulty for topics that don't set their own. */
  difficulty: number;
  topics: SeedTopic[];
}

const flat = (names: string[], hard: string[] = []): SeedTopic[] =>
  names.map((name) => (hard.includes(name) ? { name, difficulty: 4 } : { name }));

export const SEE_GRADE_10: SeedSubject[] = [
  {
    name: 'English',
    confidence: 'high',
    examWeight: 'medium',
    difficulty: 2,
    topics: [
      ...flat([
        'Letter Writing',
        'Paragraph Writing',
        'Essay Writing',
        'Story Writing',
        'Seen Passage',
        'Application Writing',
        'Argumentative Writing',
        'Advertisement',
        'Newspaper Article',
      ]),
      {
        name: 'Grammar',
        subtopics: flat([
          'Articles',
          'Transformation',
          'Question Tags',
          'Conditional Sentences',
          'Prepositions',
          'Reported Speech',
          'Causative Verb',
          'Relative Clause',
          'Subject-Verb Concord',
          'Tenses',
        ]),
      },
    ],
  },
  {
    // The syllabus had no Nepali topics: these are the app's own suggestions.
    name: 'Nepali',
    confidence: 'high',
    examWeight: 'medium',
    difficulty: 2,
    topics: flat(['Vyakaran (grammar)', 'Rachana (composition)', 'Sahitya (literature)']),
  },
  {
    name: 'Science',
    confidence: 'low',
    examWeight: 'medium',
    difficulty: 3,
    topics: [
      {
        name: 'Physics',
        subtopics: flat(
          ['Force', 'Pressure', 'Energy', 'Heat', 'Light', 'Electricity and Magnetism'],
          ['Electricity and Magnetism', 'Light'],
        ),
      },
      {
        name: 'Chemistry',
        subtopics: flat(
          [
            'Classification of Elements',
            'Chemical Reactions and Equations',
            'Acid, Base and Salt',
            'Some Gases',
            'Metals',
            'Carbon and its Compounds',
            'Materials used in Daily Life',
          ],
          ['Chemical Reactions and Equations', 'Carbon and its Compounds'],
        ),
      },
      {
        name: 'Biology',
        subtopics: flat(
          [
            'Human Nervous and Glandular System',
            'Chromosome and Sex Determination',
            'Reproduction',
            'Blood Circulation in Human Body',
            'Heredity',
            'Invertebrates',
            'Environment Pollution and Management',
          ],
          ['Heredity'],
        ),
      },
      {
        name: 'Astronomy and Geology',
        subtopics: flat(['History of Earth', 'The Atmosphere', 'The Universe']),
      },
    ],
  },
  {
    name: 'Social Studies',
    confidence: 'medium',
    examWeight: 'medium',
    difficulty: 2,
    topics: flat([
      'Our Tradition, Values and Norms',
      'Social Problems and Solutions',
      'Civic Sense',
      'Geographical Studies of Earth',
      'Our Past',
      'Economic Activities',
      'International Relation, Peace and Co-operation',
      'Infrastructures for Development',
      'We and Our Community',
    ]),
  },
  {
    name: 'Compulsory Mathematics',
    confidence: 'low',
    examWeight: 'medium',
    difficulty: 3,
    topics: [
      { name: 'Sets' },
      {
        name: 'Arithmetic',
        subtopics: flat(
          [
            'Time and Work',
            'Profit and Loss',
            'Compound Interest',
            'Population Growth and Compound Depreciation',
          ],
          ['Population Growth and Compound Depreciation'],
        ),
      },
      {
        name: 'Mensuration',
        subtopics: flat([
          'Area of Triangle',
          'Triangular Prism',
          'Cylinder',
          'Sphere and Hemisphere',
          'Cone',
          'Pyramid',
        ]),
      },
      { name: 'Algebra' },
      {
        name: 'Geometry',
        subtopics: flat(
          ['Triangle', 'Construction', 'Circle', 'Experimental Verifications of Theorems'],
          ['Experimental Verifications of Theorems'],
        ),
      },
      { name: 'Trigonometry', difficulty: 4 },
      { name: 'Statistics' },
      { name: 'Probability' },
    ],
  },
  {
    name: 'Environment, Population and Health',
    confidence: 'medium',
    examWeight: 'medium',
    difficulty: 2,
    topics: flat([
      'Demography',
      'Quality of Life',
      'Environmental Status of Nepal',
      'Biodiversity',
      'Population, Environment and Development',
      'Disease, Nutrition, Tobacco, Alcohol and Drugs',
      'Community Health',
    ]),
  },
  {
    name: 'Optional Mathematics',
    confidence: 'low',
    examWeight: 'medium',
    difficulty: 3,
    topics: [
      {
        name: 'Algebra',
        subtopics: flat(['Functions and Polynomials', 'Sequence and Series']),
      },
      { name: 'Matrix' },
      {
        name: 'Trigonometry',
        subtopics: flat(
          [
            'Trigonometric Ratios of Compound Angles',
            'Trigonometric Ratios of Multiple Angles',
            'Trigonometric Ratios of Sub Multiple Angles',
            'Transformation of Trigonometric Formulae',
            'Conditional Trigonometric Identities',
            'Solutions of Trigonometric Equations',
            'Height and Distance',
          ],
          ['Conditional Trigonometric Identities', 'Solutions of Trigonometric Equations'],
        ),
      },
      { name: 'Vector' },
      {
        name: 'Co-ordinate Geometry',
        subtopics: flat(['Angles between two lines', 'Pairs of straight lines', 'Circle'], [
          'Pairs of straight lines',
        ]),
      },
      { name: 'Statistics' },
      {
        name: 'Transformation',
        subtopics: flat(['Combination of Transformations', 'Transformation using Matrix']),
      },
    ],
  },
  {
    name: 'Computer Science',
    confidence: 'low',
    examWeight: 'medium',
    difficulty: 3,
    topics: flat(
      [
        'Cyber Law and Computer Ethics',
        'Networking and Telecommunication',
        'Internet and its Services',
        'Computer Security',
        'Computer Virus',
        'Multimedia and its Applications',
        'Computer Number System',
        'Database Management System – MS Access',
        'Modular Programming in QBASIC',
        'File Handling in QBASIC',
        'Structured Programming – C Language',
      ],
      ['File Handling in QBASIC', 'Structured Programming – C Language'],
    ),
  },
  {
    name: 'Accountancy',
    confidence: 'medium',
    examWeight: 'medium',
    difficulty: 2,
    topics: flat([
      'Office Procedure',
      'Filing and Indexing',
      'Trade',
      'Financial Institutions',
      'Trial Balance',
      'Final Accounts',
      'Government Accounting',
      'Journal Voucher',
      'Budget Sheet',
      'Monthly Statement',
      'Bank Cash Book',
      'Petty Cash Book',
    ]),
  },
];
