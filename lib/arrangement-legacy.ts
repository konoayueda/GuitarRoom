import { z } from "zod";

const id = z.string().min(1).max(100);
const fingering = z
  .object({
    name: z.string().min(1).max(40),
    frets: z.array(z.number().int().min(-1).max(24)).length(6),
    fingers: z.array(z.number().int().min(0).max(4)).length(6),
  })
  .strict()
  .refine((c) => c.frets.some((f) => f >= 0), "使用休止来表示不发声");
export const legacyArrangementSchema = z
  .object({
    version: z.literal(1),
    bpm: z.number().int().min(30).max(240),
    meter: z.enum(["4/4", "3/4", "6/8"]),
    pattern: z.enum(["strum", "arpeggio"]),
    sections: z
      .array(
        z
          .object({
            id,
            label: z.string().trim().min(1).max(30),
            repeat: z.number().int().min(1).max(8),
            bars: z
              .array(
                z
                  .object({
                    id,
                    pageId: id.optional(),
                    events: z
                      .array(
                        z
                          .object({
                            id,
                            chord: fingering.nullable(),
                            durationTicks: z.number().int().min(1).max(8),
                            notes: z
                              .array(
                                z
                                  .object({
                                    offsetTick: z.number().int().min(0).max(7),
                                    stringIndex: z.number().int().min(0).max(5),
                                    fret: z.number().int().min(0).max(24),
                                  })
                                  .strict(),
                              )
                              .max(48)
                              .optional(),
                          })
                          .strict(),
                      )
                      .min(1)
                      .max(8),
                  })
                  .strict(),
              )
              .min(1)
              .max(32),
          })
          .strict(),
      )
      .max(16),
  })
  .strict()
  .superRefine((a, ctx) => {
    const allIds = new Set<string>();
    let count = 0;
    const checkId = (value: string) => {
      if (allIds.has(value))
        ctx.addIssue({ code: "custom", message: "编排标识重复" });
      allIds.add(value);
    };
    for (const section of a.sections) {
      checkId(section.id);
      for (const bar of section.bars) {
        count++;
        checkId(bar.id);
        for (const e of bar.events) {
          checkId(e.id);
          const coordinates = new Set<string>();
          for (const note of e.notes ?? []) {
            const coordinate = note.offsetTick + ":" + note.stringIndex;
            if (
              note.offsetTick >= e.durationTicks ||
              coordinates.has(coordinate)
            )
              ctx.addIssue({
                code: "custom",
                message: "音符位置超出时值或重复",
              });
            coordinates.add(coordinate);
          }
        }
        if (
          bar.events.reduce((n, e) => n + e.durationTicks, 0) !==
          (a.meter === "4/4" ? 8 : 6)
        )
          ctx.addIssue({ code: "custom", message: "请补齐每个小节的时值" });
      }
    }
    if (count > 128)
      ctx.addIssue({ code: "custom", message: "一份编排最多128个小节" });
  });
