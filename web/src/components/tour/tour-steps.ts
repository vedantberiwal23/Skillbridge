import type { Role } from '@/lib/types';
import type { Locale } from '@/i18n/config';

/**
 * The guided product tour, one script per role.
 *
 * A step points at an element by its `data-tour` attribute rather than by a
 * CSS class or DOM path, so restyling a screen cannot silently break the tour —
 * the attribute is the contract. A step with no `target` renders as a centred
 * card over a fully dimmed screen, which is what the intro and outro want.
 *
 * If a target is missing when its step comes up (a screen still loading, a
 * section that did not render for this user), the step falls back to the
 * centred card rather than stalling: a tour that hangs on stage is worse than
 * one that briefly loses its spotlight.
 */

type Copy = { title: string; body: string };

export interface TourStep {
  id: string;
  /** Matches `data-tour="<target>"`. Omit for a centred card. */
  target?: string;
  /** Navigate here before showing the step, if not already on it. */
  route?: string;
  /** English is required; other locales fall back to it. */
  copy: { en: Copy } & Partial<Record<Exclude<Locale, 'en'>, Copy>>;
}

export interface TourScript {
  /** Bump when the script changes enough that everyone should see it again. */
  version: number;
  /** The route the tour starts on; auto-start only fires here. */
  startRoute: string;
  steps: TourStep[];
}

const worker: TourScript = {
  version: 1,
  startRoute: '/home',
  steps: [
    {
      id: 'intro',
      route: '/home',
      copy: {
        en: {
          title: 'Welcome to SkillBridge',
          body: 'A one-minute look around. You learn your trade here, ask questions out loud in your own language, and earn skills your plant can verify.',
        },
        hi: {
          title: 'SkillBridge में आपका स्वागत है',
          body: 'एक मिनट का परिचय। यहाँ आप अपना काम सीखते हैं, अपनी भाषा में बोलकर सवाल पूछते हैं, और ऐसे skills कमाते हैं जिन्हें आपका plant verify कर सके।',
        },
        mr: {
          title: 'SkillBridge मध्ये आपले स्वागत आहे',
          body: 'एका मिनिटाची ओळख. इथे तुम्ही तुमचे काम शिकता, तुमच्या भाषेत बोलून प्रश्न विचारता, आणि plant verify करू शकेल असे skills मिळवता.',
        },
      },
    },
    {
      id: 'continue',
      target: 'continue-learning',
      route: '/home',
      copy: {
        en: {
          title: 'Pick up where you left off',
          body: 'Your next lesson is always here, with how far through your trade you are. One tap and you are back in.',
        },
        hi: {
          title: 'जहाँ छोड़ा था, वहीं से शुरू करें',
          body: 'आपका अगला lesson हमेशा यहीं मिलेगा, साथ में आपकी progress भी। एक tap और आप वापस सीखने लगेंगे।',
        },
        mr: {
          title: 'जिथे थांबलात तिथून सुरू करा',
          body: 'तुमचा पुढचा lesson नेहमी इथे असतो, तुमच्या progress सोबत. एक tap आणि तुम्ही परत शिकायला सुरुवात करता.',
        },
      },
    },
    {
      id: 'voice',
      copy: {
        en: {
          title: 'Ask out loud, hands free',
          body: 'Inside every lesson, hold the mic and ask in Hindi, Marathi or English. The tutor answers from your company’s own procedures — and tells you when to stop and ask your supervisor.',
        },
        hi: {
          title: 'बोलकर पूछें, हाथ खाली रखें',
          body: 'हर lesson में mic दबाकर हिंदी, मराठी या English में पूछें। Tutor आपकी company की procedures से जवाब देता है — और बताता है कब रुककर supervisor से पूछना है।',
        },
        mr: {
          title: 'बोलून विचारा, हात मोकळे ठेवा',
          body: 'प्रत्येक lesson मध्ये mic दाबून मराठी, हिंदी किंवा English मध्ये विचारा. Tutor तुमच्या company च्या procedures मधून उत्तर देतो — आणि supervisor ला कधी विचारायचे ते सांगतो.',
        },
      },
    },
    {
      id: 'skills',
      target: 'your-skills',
      route: '/home',
      copy: {
        en: {
          title: 'Skills you have proven',
          body: 'Pass an assessment and the skill is verified. Locked ones show what to learn next.',
        },
        hi: {
          title: 'आपके साबित किए हुए skills',
          body: 'Assessment pass करते ही skill verified हो जाता है। Locked skills बताते हैं कि आगे क्या सीखना है।',
        },
        mr: {
          title: 'तुम्ही सिद्ध केलेले skills',
          body: 'Assessment pass केल्यावर skill verified होतो. Locked skills पुढे काय शिकायचे ते दाखवतात.',
        },
      },
    },
    {
      id: 'nav-learn',
      target: 'nav-learn',
      copy: {
        en: { title: 'Learn', body: 'Every trade and course your plant offers, in order.' },
        hi: { title: 'Learn', body: 'आपके plant के सारे trades और courses, सही क्रम में।' },
        mr: { title: 'Learn', body: 'तुमच्या plant चे सर्व trades आणि courses, योग्य क्रमाने.' },
      },
    },
    {
      id: 'nav-skills',
      target: 'nav-skills',
      copy: {
        en: { title: 'Skills', body: 'Your progress and assessment results in one place.' },
        hi: { title: 'Skills', body: 'आपकी progress और assessment के नतीजे, एक जगह।' },
        mr: { title: 'Skills', body: 'तुमची progress आणि assessment चे निकाल, एकाच ठिकाणी.' },
      },
    },
    {
      id: 'nav-profile',
      target: 'nav-profile',
      copy: {
        en: {
          title: 'Profile',
          body: 'Change your language or switch between voice and reading any time.',
        },
        hi: { title: 'Profile', body: 'भाषा बदलें, या voice और reading के बीच कभी भी switch करें।' },
        mr: { title: 'Profile', body: 'भाषा बदला, किंवा voice आणि reading मध्ये कधीही switch करा.' },
      },
    },
    {
      id: 'replay',
      target: 'tour-launcher',
      route: '/home',
      copy: {
        en: {
          title: 'You’re all set',
          body: 'Tap here whenever you want this tour again. Now start your first lesson.',
        },
        hi: { title: 'सब तैयार है', body: 'यह tour दोबारा देखने के लिए यहाँ tap करें। अब अपना पहला lesson शुरू करें।' },
        mr: { title: 'सगळं तयार आहे', body: 'हा tour पुन्हा पाहण्यासाठी इथे tap करा. आता तुमचा पहिला lesson सुरू करा.' },
      },
    },
  ],
};

const manager: TourScript = {
  version: 1,
  startRoute: '/dashboard',
  steps: [
    {
      id: 'intro',
      route: '/dashboard',
      copy: {
        en: {
          title: 'Your team’s training, at a glance',
          body: 'SkillBridge trains your workers by voice, in their language, on your own procedures. This console shows where your department stands, who needs help, and lets you organise your people. Two minutes.',
        },
      },
    },
    {
      id: 'dept',
      target: 'dept-switcher',
      route: '/dashboard',
      copy: {
        en: {
          title: 'Your departments',
          body: 'If you run more than one department, switch between them here. Everything on the page follows.',
        },
      },
    },
    {
      id: 'kpis',
      target: 'kpis',
      route: '/dashboard',
      copy: {
        en: {
          title: 'The four numbers that matter',
          body: 'Headcount, pass rate, assessments taken and your biggest skill gap — with the change since last month when there is one to compare.',
        },
      },
    },
    {
      id: 'period',
      target: 'period',
      route: '/dashboard',
      copy: {
        en: {
          title: 'Compare months',
          body: 'Switch to last month to see whether a refresher actually moved the numbers.',
        },
      },
    },
    {
      id: 'gaps',
      target: 'skill-gaps',
      route: '/dashboard',
      copy: {
        en: {
          title: 'Where the team is weakest',
          body: 'Each skill shows the share of assessed workers below target, worst first. Red means schedule a refresher; amber means keep watching.',
        },
      },
    },
    {
      id: 'attention',
      target: 'attention',
      route: '/dashboard',
      copy: {
        en: {
          title: 'What to do next',
          body: 'The numbers turned into a short list of actions, so you know where to start without reading every chart.',
        },
      },
    },
    {
      id: 'roster',
      target: 'roster',
      route: '/dashboard',
      copy: {
        en: {
          title: 'Everyone in the department',
          body: 'Each worker’s trade, level and whether they have finished setting up. People without a trade have not started training yet.',
        },
      },
    },
    {
      id: 'nav-team',
      target: 'nav-team',
      copy: {
        en: {
          title: 'Team & groups',
          body: 'Organise your people the way the floor actually runs — by crew, shift or line.',
        },
      },
    },
    {
      id: 'groups',
      target: 'groups-rail',
      route: '/team',
      copy: {
        en: {
          title: 'Groups',
          body: 'Make a group for each crew, shift or line. “Not in a group” shows who still needs a place.',
        },
      },
    },
    {
      id: 'bulk',
      target: 'bulk-actions',
      route: '/team',
      copy: {
        en: {
          title: 'Act on several people at once',
          body: 'Tick people, then add them to a group or move them to another department you run.',
        },
      },
    },
    {
      id: 'replay',
      target: 'tour-launcher',
      copy: {
        en: {
          title: 'That’s the tour',
          body: 'Replay it from here any time, or hand it to a new supervisor.',
        },
      },
    },
  ],
};

const admin: TourScript = {
  version: 1,
  startRoute: '/overview',
  steps: [
    {
      id: 'intro',
      route: '/overview',
      copy: {
        en: {
          title: 'Set up your organization',
          body: 'As an admin you shape the organization: its departments, who runs them, and who is in them. Nobody can sign up on their own — every account starts with an invite from you.',
        },
      },
    },
    {
      id: 'stats',
      target: 'org-stats',
      route: '/overview',
      copy: {
        en: {
          title: 'The whole organization',
          body: 'Departments, workers, managers — and anyone who joined but has not been placed in a department yet. Below, open any department’s dashboard.',
        },
      },
    },
    {
      id: 'create',
      target: 'dept-create',
      route: '/departments',
      copy: {
        en: {
          title: 'Create departments',
          body: 'Maintenance, Operations, Quality — split the plant the way it runs. Each department gets its own dashboard and groups.',
        },
      },
    },
    {
      id: 'list',
      target: 'dept-list',
      route: '/departments',
      copy: {
        en: {
          title: 'Choose who runs each one',
          body: 'Edit a department to add managers. A manager invited into a department runs it automatically; you can give them more.',
        },
      },
    },
    {
      id: 'people',
      target: 'people-table',
      route: '/users',
      copy: {
        en: {
          title: 'Everyone, and where they belong',
          body: 'Filter by role or department, and move anyone between departments from the dropdown on their row.',
        },
      },
    },
    {
      id: 'invite',
      target: 'invite-form',
      route: '/invites',
      copy: {
        en: {
          title: 'Bring people in',
          body: 'Invite workers by SMS — most of the shop floor has no work email — and managers by email. Role and department come from the invite, never from the person.',
        },
      },
    },
    {
      id: 'replay',
      target: 'tour-launcher',
      copy: {
        en: { title: 'Done', body: 'Replay this tour from here whenever you need it.' },
      },
    },
  ],
};

export const TOURS: Record<Role, TourScript> = { worker, manager, admin };

export function tourCopy(step: TourStep, locale: Locale): Copy {
  if (locale === 'en') return step.copy.en;
  return step.copy[locale] ?? step.copy.en;
}
