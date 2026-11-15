import { useId } from 'react'
import { CloudRain, Hand, NotebookPen, Satellite } from 'lucide-react'
import type { LocationCompareResponse } from '../../types/api'
import { cx, fg, surface, tabular, type } from '../../lib/ui4/cls'
import { Term } from '../ui/Term'

interface SourceRow {
  key: string
  name: string
  what: string
  footprint: string
  /** footprint width in metres, for the size cue */
  metres: number
}

function powerKm(data: LocationCompareResponse): number {
  const deg = Number(data.location.nasa_grid_cell?.size_deg)
  // 0.5° ≈ 55 km north-south; quoted as "about 50 km" in plain words
  return Number.isFinite(deg) && deg > 0 ? Math.round((deg * 111) / 5) * 5 : 50
}

/** The sources that actually fed this analysis, with how big an area each one value covers. */
export function usedFootprints(data: LocationCompareResponse): SourceRow[] {
  const q = { ...(data.data_quality ?? {}), ...(data.profile?.data_quality ?? {}) }
  const geo = data.data_retrieval?.geospatial
  const rows: SourceRow[] = []
  const km = powerKm(data)
  rows.push({ key: 'power', name: 'NASA POWER', what: 'rain, temperature, root-zone wetness', footprint: `about ${km} km square`, metres: km * 1000 })
  if (q.smap === 'observed') rows.push({ key: 'smap', name: 'NASA SMAP', what: 'soil moisture', footprint: '9 km square', metres: 9000 })
  if (data.profile?.data_quality?.modis === 'observed')
    rows.push({ key: 'modis', name: 'MODIS NDVI', what: 'crop greenness, bare soil', footprint: '250 m square', metres: 250 })
  if (geo?.soil?.status === 'available' || (q.soil && q.soil !== 'unavailable'))
    rows.push({ key: 'soil', name: 'ISRIC SoilGrids', what: 'soil type, pH, carbon', footprint: '250 m square', metres: 250 })
  if (geo?.terrain?.status === 'available' || (q.terrain && q.terrain !== 'unavailable'))
    rows.push({ key: 'terrain', name: 'Copernicus DEM', what: 'height and slope', footprint: '30 m square', metres: 30 })
  return rows
}

/** Size cue on a log scale: 30 m -> small dot, 50 km -> full box. Decorative; the text carries the value. */
function SizeCue({ metres }: { metres: number }) {
  const t = Math.min(1, Math.max(0, (Math.log10(metres) - Math.log10(1)) / (Math.log10(60000) - Math.log10(1))))
  const px = Math.max(4, Math.round(t * 28))
  return (
    <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[rgba(0,0,0,0.25)]">
      <span className="rounded-[3px] border border-[color:var(--color-accent,#4ade80)] bg-[rgba(74,222,128,0.2)]" style={{ width: px, height: px }} />
    </span>
  )
}

/**
 * Satellite vs ground (challenge point 14): what each data source "sees", why a rain gauge or a soil
 * probe on the field still matters, and how to combine both.
 */
export default function SatelliteVsGround({ data, tone = 'flat' }: { data: LocationCompareResponse; tone?: 'flat' | 'glass' }) {
  const rows = usedFootprints(data)
  const hid = useId()
  return (
    <section aria-labelledby={hid} className={cx(surface[tone], 'flex min-w-0 flex-col gap-3 p-4')}>
      <h3 id={hid} className={cx('m-0 flex items-center gap-2 font-semibold', type.body, fg.fg)}>
        <Satellite size={18} aria-hidden="true" className={fg.accent} />
        Satellite and ground: what each one sees
      </h3>
      <p className={cx('m-0', type.label, fg.fg2)}>
        Satellites and computer models see an <strong className={fg.fg}>area</strong>: each number is one average for a
        whole square of land (a <Term id="grid_cell">grid cell</Term>). This analysis used:
      </p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {rows.map((r) => (
          <li key={r.key} className="flex min-w-0 items-center gap-3">
            <SizeCue metres={r.metres} />
            <span className={cx('min-w-0 flex-1', type.label, fg.fg2)}>
              <span className={cx('font-semibold', fg.fg)}>{r.name}</span> ({r.what})
            </span>
            <span className={cx('shrink-0 text-right font-semibold', type.label, fg.fg, tabular)}>{r.footprint}</span>
          </li>
        ))}
        <li className="flex min-w-0 items-center gap-3 border-t border-[color:var(--color-glass-border,rgba(190,242,220,0.16))] pt-2">
          <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[rgba(0,0,0,0.25)]">
            <span className="h-1 w-1 rounded-full bg-[color:var(--color-demo,#fbbf24)]" />
          </span>
          <span className={cx('min-w-0 flex-1', type.label, fg.fg2)}>
            <span className={cx('font-semibold', fg.fg)}>Your rain gauge or soil probe</span> (what fell or how wet it is)
          </span>
          <span className={cx('shrink-0 text-right font-semibold', type.label, fg.fg)}>one exact spot</span>
        </li>
      </ul>
      <p className={cx('m-0', type.label, fg.fg2)}>
        <strong className={fg.fg}>Why use both:</strong> satellites give 20+ years of history and the big picture no
        farmer could record alone, but they average away your canal, your shade trees and the shower that fell only on
        your village. A gauge or probe is exact for your field but only for the days you measured. Together they tell you
        whether your field is wetter, drier or hotter than the area, so you can adjust the advice.
      </p>
      <ul className={cx('m-0 flex list-none flex-col gap-2 p-0', type.label, fg.fg2)} aria-label="Practical tips">
        <li className="flex items-start gap-2">
          <CloudRain size={16} aria-hidden="true" className={cx('mt-0.5 shrink-0', fg.accent)} />
          <span>
            <strong className={fg.fg}>Keep a rain gauge.</strong> A straight-sided tin or bottle in the open, away from
            trees and roofs, is enough. Read it each morning after rain and write down the millimetres.
          </span>
        </li>
        <li className="flex items-start gap-2">
          <Hand size={16} aria-hidden="true" className={cx('mt-0.5 shrink-0', fg.accent)} />
          <span>
            <strong className={fg.fg}>Check the soil before sowing.</strong> Push a steel rod or probe in, or dig a hand
            deep and squeeze the soil: if it holds a ball and leaves your palm damp, there is water for the seed.
          </span>
        </li>
        <li className="flex items-start gap-2">
          <NotebookPen size={16} aria-hidden="true" className={cx('mt-0.5 shrink-0', fg.accent)} />
          <span>
            <strong className={fg.fg}>Compare your notes with the charts.</strong> If your gauge is often higher or lower
            than the monthly rain shown here, trust your own record and read the advice with that in mind.
          </span>
        </li>
      </ul>
    </section>
  )
}
