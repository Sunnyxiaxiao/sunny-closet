import type { Metadata } from "next";

export const metadata: Metadata = { title: "租赁须知" };

const sections = [
  {
    title: "租期怎么算",
    body: "取件日和归还日都计入租期。例如 10 号取件、12 号归还，按 3 天计费；同一天取还按 1 天计费。",
  },
  {
    title: "押金",
    body: "（占位文字）押金在取件时收取，雪服归还并检查无损后全额退还。",
  },
  {
    title: "取件与归还",
    body: "（占位文字）支持到店自取或邮寄。到店自取请在营业时间内前来；邮寄的往返运费及时效以客服确认为准。",
  },
  {
    title: "清洁与卫生",
    body: "（占位文字）每件雪服归还后都会专业清洗消毒，并预留整理时间，确保下一位顾客拿到干净的衣物。",
  },
  {
    title: "取消与改期",
    body: "（占位文字）如需取消或改期，请尽早联系我们。具体规则以客服确认为准。",
  },
  {
    title: "损坏与遗失",
    body: "（占位文字）正常使用造成的轻微磨损无需赔偿；严重损坏或遗失将从押金中扣除相应费用。",
  },
];

export default function RentalInfoPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <h1 className="text-3xl font-black">租赁须知</h1>
      <div className="mt-8 divide-y divide-neutral-200 border-y border-neutral-200">
        {sections.map((s) => (
          <section key={s.title} className="py-5">
            <h2 className="font-bold">{s.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-700">{s.body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
