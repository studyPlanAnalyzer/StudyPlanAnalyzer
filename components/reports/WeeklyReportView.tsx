'use client';

import Link from 'next/link';
import {
  formatDay,
  formatMinutes,
  formatWeekRange,
  reportStrings,
} from '@/lib/reports/strings';
import type { ActionKind, WeeklyReportSnapshot } from '@/lib/reports/types';
import { buttonClass } from '@/components/ui/Button';
import { cardClass } from '@/components/ui/Card';

// ---------------------------------------------------------------------------
// The full weekly report, drawn from the stored snapshot only, so it always
// shows exactly what the email said. Used by the parent's report page and
// the admin preview. Gentle colours only: nothing here is red.
// ---------------------------------------------------------------------------

const card = `${cardClass} p-5 sm:p-7`;
const h2 = 'text-lg font-bold tracking-tight sm:text-xl';
const row = 'flex flex-col gap-0.5 border-b border-[#F0EFED] py-3 last:border-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6';
const label = 'text-sm text-[#65615D]';
const value = 'text-sm font-semibold sm:text-right';
const note = 'mt-2 text-sm leading-6 text-[#8A8580]';
const pill = buttonClass('primary');
const softPill = buttonClass('secondary');

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className={row}>
      <span className={label}>{k}</span>
      <span className={value}>{v}</span>
    </div>
  );
}

/** Where the "one thing to do" takes the parent, if anywhere. */
function actionHref(kind: ActionKind, studentId: string): string | null {
  const base = `/students/${studentId}`;
  switch (kind) {
    case 'pay_to_keep_access':
      return `${base}/pay`;
    case 'start_new_exam_cycle':
      return `${base}/new-exam`;
    case 'create_plan':
      return `${base}/analysis`;
    case 'log_test':
      return `${base}/add-test-marks`;
    default:
      return null;
  }
}

export function WeeklyReportView({
  report: r,
  language,
}: {
  report: WeeklyReportSnapshot;
  language?: string | null;
}) {
  const s = reportStrings(language);
  const v = s.view;
  const L = s.label;
  const name = r.studentName;
  const base = `/students/${r.studentId}`;
  const ratingsTotal =
    r.revision.ratings.again + r.revision.ratings.hard + r.revision.ratings.good + r.revision.ratings.easy;
  const action = s.action(r.action.kind, name, r.action);
  const href = actionHref(r.action.kind, r.studentId);

  return (
    <div className="space-y-5">
      {/* HEADLINE */}
      <section className={card}>
        <p className="text-sm font-medium text-[#8A8580]">
          {formatWeekRange(r.week.start, r.week.end)}
          {r.context.builtLater && (
            <span className="ml-2 rounded-full bg-[#F0EFED] px-3 py-1 text-sm font-semibold text-[#65615D]">
              {v.builtLaterShort}
            </span>
          )}
        </p>
        {r.context.builtLater && <p className={note}>{v.builtLaterNote}</p>}
        <h1 className="mt-1 text-2xl font-extrabold leading-tight tracking-[-0.03em] sm:text-3xl">
          {s.headline(r.headline, name)}
        </h1>
        {r.context.isFirstReport && <p className="mt-3 text-sm leading-6 text-[#65615D]">{v.firstReport}</p>}
        {r.context.addedThisWeek && <p className="mt-3 text-sm leading-6 text-[#65615D]">{s.addedThisWeek(name)}</p>}
        {r.context.paymentDue && (
          <p className="mt-4 rounded-2xl bg-[#FFF6E5] px-4 py-3 text-sm text-[#7A5A12]">
            {s.paymentDue(name)}{' '}
            <Link href={`${base}/pay`} className="font-semibold underline">
              {v.payNow}
            </Link>
          </p>
        )}
      </section>

      {/* ONE THING TO DO */}
      <section className={`${card} bg-[#EEF0FF]`}>
        <h2 className={h2}>{L.oneThing}</h2>
        <p className="mt-2 text-base leading-7">{action}</p>
        {href && (
          <Link href={href} className={`${pill} mt-4`}>
            {v.doIt}
          </Link>
        )}
      </section>

      {/* STUDY */}
      {r.studyTime ? (
        // A version 2 report: minutes and planned sessions, as it was made.
        <section className={card}>
          <h2 className={h2}>{L.studyTime}</h2>
          <Row
            k={L.studyTime}
            v={v.minutesValue(
              formatMinutes(r.studyTime.minutes),
              r.studyTime.lastWeekMinutes === null ? null : formatMinutes(r.studyTime.lastWeekMinutes),
            )}
          />
          <Row
            k={L.studyDays}
            v={
              r.consistency.plannedDays === 0
                ? v.noPlannedDays
                : v.daysValue(r.consistency.plannedDaysStudied, r.consistency.plannedDays, r.consistency.extraDaysStudied)
            }
          />
          <Row k={L.studyDayStreak} v={v.streakValue(r.consistency.studyDayStreak)} />
          <Row
            k={L.sessions}
            v={r.adherence.required === 0 ? v.noSessions : v.sessionsValue(r.adherence.finished, r.adherence.required)}
          />
          {r.adherence.notDone > 0 && <Row k={L.notDone} v={String(r.adherence.notDone)} />}
          <p className={note}>
            {s.studyTimeNote} {v.streakNote} {v.optionalNote}
          </p>
        </section>
      ) : (
        <section className={card}>
          <h2 className={h2}>{L.study}</h2>
          {r.topicsDone && (
            <Row
              k={L.topicsDone}
              v={v.minutesValue(
                String(r.topicsDone.count),
                r.topicsDone.lastWeek === null ? null : String(r.topicsDone.lastWeek),
              )}
            />
          )}
          {r.adherence.required > 0 && (
            <Row k={L.listed} v={v.listedValue(r.adherence.finished, r.adherence.required)} />
          )}
          {r.revised && <Row k={L.revisedEarlier} v={v.revisedValue(r.revised.count, r.revised.hard)} />}
          <Row
            k={L.studyDays}
            v={
              r.consistency.plannedDays === 0
                ? v.noPlannedDays
                : v.daysValue(r.consistency.plannedDaysStudied, r.consistency.plannedDays, r.consistency.extraDaysStudied)
            }
          />
          <Row k={L.studyDayStreak} v={v.streakValue(r.consistency.studyDayStreak)} />
          <p className={note}>
            {s.listNote} {v.streakNote}
          </p>
        </section>
      )}

      {/* REVISION */}
      <section className={card}>
        <h2 className={h2}>{L.revisions}</h2>
        <p className="mt-2 text-sm leading-6 text-[#65615D]">{s.spacedRevisionExplainer}</p>
        <Row k={L.revisions} v={v.reviewsValue(r.revision.reviewsDone, r.revision.reviewsOnTime)} />
        {r.revision.newTopicsLearned.length > 0 && (
          <Row k={L.newTopics} v={r.revision.newTopicsLearned.map((t) => t.topicName).join(', ')} />
        )}
        {ratingsTotal > 0 && (
          <div className="mt-3">
            <p className="text-sm font-semibold">{v.ratingsTitle}</p>
            <div className="mt-2 grid grid-cols-4 gap-2 text-center">
              {(['again', 'hard', 'good', 'easy'] as const).map((k) => (
                <div key={k} className="rounded-2xl bg-[#F6F5F2] px-2 py-3">
                  <div className="text-lg font-bold">{r.revision.ratings[k]}</div>
                  <div className="text-sm text-[#65615D]">{v.ratingNames[k]}</div>
                </div>
              ))}
            </div>
            <p className={note}>
              {v.goodEasyShare(Math.round(((r.revision.ratings.good + r.revision.ratings.easy) / ratingsTotal) * 100))}.{' '}
              {v.ratingsNote}
            </p>
          </div>
        )}
        <div className="mt-4">
          <p className="text-sm font-semibold">{L.gettingStronger}</p>
          {r.revision.gettingStronger === null ? (
            <p className={note}>{v.strongerFirstWeek}</p>
          ) : r.revision.gettingStronger.length === 0 ? (
            <p className={note}>—</p>
          ) : (
            <ul className="mt-1 space-y-1 text-sm">
              {r.revision.gettingStronger.map((t) => (
                <li key={`${t.subjectName}-${t.topicName}`}>
                  {v.strongerItem(t.topicName, t.everyDays, t.lastWeekEveryDays)}{' '}
                  <span className="text-[#8A8580]">· {t.subjectName}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {r.revision.needsAttention.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-semibold">{L.needsAttention}</p>
            <ul className="mt-1 space-y-1 text-sm">
              {r.revision.needsAttention.map((t) => (
                <li key={`${t.subjectName}-${t.topicName}`}>
                  {t.topicName} <span className="text-[#8A8580]">· {t.subjectName} · {v.attentionReason[t.reason]}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* CHALLENGE AND HABITS */}
      <section className={card}>
        <h2 className={h2}>{L.challenge}</h2>
        <Row k={L.challenge} v={v.challengeValue(r.challenge.attempts, r.challenge.averagePercent)} />
        {r.challenge.bestDay && <p className={note}>{v.bestDay(formatDay(r.challenge.bestDay.date), r.challenge.bestDay.percent)}</p>}
        {r.challenge.lastWeek && <p className={note}>{v.lastWeekChallenge(r.challenge.lastWeek.attempts, r.challenge.lastWeek.averagePercent)}</p>}
        <h2 className={`${h2} mt-6`}>{L.habits}</h2>
        <Row k={L.habits} v={v.habitsValue(r.habits.completed, r.habits.total)} />
        <p className={note}>{v.habitStreak(r.habits.streak)}</p>
      </section>

      {/* TESTS */}
      <section className={card}>
        <h2 className={h2}>{L.tests}</h2>
        {!r.tests.logged ? (
          <>
            <p className="mt-2 text-sm text-[#65615D]">{s.noTestLogged}</p>
            <Link href={`${base}/add-test-marks`} className={`${softPill} mt-4`}>
              {v.logTest}
            </Link>
          </>
        ) : (
          <>
            {[...r.tests.subjects, ...r.tests.topics].map((t) => (
              <div key={`${t.subjectName}-${t.name}-${t.assessmentName}`} className={row}>
                <span className={label}>
                  {t.name === t.subjectName ? t.name : `${t.name} · ${t.subjectName}`}
                  <span className="block text-sm text-[#8A8580]">
                    {t.assessmentName}, {formatDay(t.date)}
                    {t.confidence ? ` · ${v.confidence[t.confidence]}` : ''}
                  </span>
                </span>
                <span className={value}>{v.testChange(t.percent, t.previousPercent)}</span>
              </div>
            ))}
          </>
        )}
      </section>

      {/* EXAM */}
      <section className={card}>
        <h2 className={h2}>{L.exam}</h2>
        {r.exam.state === 'upcoming' && r.exam.daysLeft !== null && (
          <>
            <Row k={r.exam.name ?? L.exam} v={v.examUpcoming(r.exam.name ?? L.exam, r.exam.daysLeft)} />
            {r.exam.topicsTotal > 0 && <Row k={v.topicsLabel} v={v.topicsStudied(r.exam.topicsStudied, r.exam.topicsTotal)} />}
            {r.exam.readiness && (
              <>
                <Row k={v.soFarLabel} v={s.readiness(r.exam.readiness)} />
                {r.exam.readiness !== 'too_early' && (
                  <p className={note}>
                    {v.readinessRule(r.exam.toDate.finished, r.exam.toDate.required)}
                  </p>
                )}
              </>
            )}
          </>
        )}
        {r.exam.state === 'over' && (
          <>
            <p className="mt-2 text-sm leading-6 text-[#65615D]">{v.examOver(r.exam.name ?? L.exam)}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href={`${base}/new-exam`} className={pill}>{v.newExamCycle}</Link>
              <Link href={`${base}/new-session`} className={softPill}>{v.newSession}</Link>
            </div>
          </>
        )}
        {r.exam.state === 'no_plan' && (
          <>
            {r.exam.daysLeft !== null && <Row k={r.exam.name ?? L.exam} v={v.examUpcoming(r.exam.name ?? L.exam, r.exam.daysLeft)} />}
            <p className="mt-2 text-sm text-[#65615D]">{v.noPlan}</p>
            <Link href={`${base}/analysis`} className={`${pill} mt-4`}>{v.createPlan}</Link>
          </>
        )}
        {r.exam.state === 'none' && (
          <>
            <p className="mt-2 text-sm text-[#65615D]">{v.noExam}</p>
            <Link href={`${base}/new-exam`} className={`${pill} mt-4`}>{v.addExam}</Link>
          </>
        )}
      </section>

      {/* NEXT WEEK */}
      {r.nextWeek && (
        <section className={card}>
          <h2 className={h2}>{L.nextWeek}</h2>
          {r.nextWeek.topics !== undefined ? (
            <Row k={L.topicsDue} v={v.nextWeekTopics(r.nextWeek.topics)} />
          ) : (
            r.nextWeek.plannedMinutes !== undefined && (
              <Row k={L.studyTime} v={v.nextWeekValue(formatMinutes(r.nextWeek.plannedMinutes))} />
            )
          )}
          {r.nextWeek.focusTopics.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-semibold">{v.focusTitle}</p>
              <ul className="mt-1 space-y-1 text-sm">
                {r.nextWeek.focusTopics.map((t) => (
                  <li key={`${t.subjectName}-${t.topicName}`}>
                    {t.topicName} <span className="text-[#8A8580]">· {t.subjectName}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* MILESTONES */}
      {r.milestonesUnlocked.length > 0 && (
        <section className={card}>
          <h2 className={h2}>{L.milestones}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {r.milestonesUnlocked.map((k) => (
              <span key={k} className="rounded-full bg-[#FFF3D6] px-4 py-2 text-sm font-semibold">
                🏅 {s.milestone(k)}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
