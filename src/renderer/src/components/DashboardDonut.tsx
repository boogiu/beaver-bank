import { useEffect, useRef } from 'react'
import { init, use as registerCharts, type EChartsType } from 'echarts/core'
import { PieChart } from 'echarts/charts'
import { TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { DashboardData } from '@shared/ipc'
import { money } from './domain-ui'
import { getReducedMotion } from '../hooks/useReducedMotion'

registerCharts([PieChart, TooltipComponent, CanvasRenderer])

type Composition = DashboardData['assets']['composition']
type ActiveKey = number | 'none' | null
const keyOf = (item: Composition[number]): number | 'none' => item.purposeId ?? 'none'

// 용도별 자산 구성 도넛. 가운데에는 전체 잔액을, 강조 중인 용도가 있으면 그 이름과 비중을 보인다.
// 강조는 구성 목록과 주고받는다(active, onActive).
export default function DashboardDonut({
  items,
  total,
  active,
  onActive
}: {
  items: Composition
  total: number | null
  active: ActiveKey
  onActive: (key: ActiveKey) => void
}): React.JSX.Element {
  const container = useRef<HTMLDivElement>(null)
  const chartRef = useRef<EChartsType | undefined>(undefined)
  const notify = useRef(onActive)
  useEffect(() => {
    notify.current = onActive
  }, [onActive])
  const visible = items.filter((item) => item.share !== null)
  const activeIndex = visible.findIndex((item) => keyOf(item) === active)
  useEffect(() => {
    const element = container.current
    if (!element) return
    let alive = true
    let chart: EChartsType | undefined
    const observer = new ResizeObserver(() => chart?.resize())
    observer.observe(element)
    // 시작 페이지에서도 글꼴이 준비된 뒤 최초 캔버스를 그린다.
    void document.fonts.load('12px Pretendard').then(() => {
      if (!alive || !document.fonts.check('12px Pretendard')) return
      const shown = items.filter((item) => item.share !== null)
      const styles = getComputedStyle(element)
      chart = init(element)
      chartRef.current = chart
      chart.setOption({
        animation: !getReducedMotion(),
        textStyle: { fontFamily: 'Pretendard', fontSize: 14 },
        tooltip: {
          trigger: 'item',
          confine: true,
          backgroundColor: styles.getPropertyValue('--surface').trim(),
          borderColor: styles.getPropertyValue('--border').trim(),
          borderWidth: 1,
          textStyle: {
            color: styles.getPropertyValue('--text').trim(),
            fontFamily: 'Pretendard',
            fontSize: 14
          },
          extraCssText: 'border-radius:8px;box-shadow:none;white-space:normal;',
          formatter: (params: { dataIndex: number }) => {
            const item = shown[params.dataIndex]
            const content = document.createElement('div')
            content.style.maxWidth = `${Math.max(0, element.clientWidth - 24)}px`
            content.style.overflowWrap = 'anywhere'
            for (const text of [item.name, money(item.amount!), `${item.share!.toFixed(1)}%`]) {
              const line = document.createElement('div')
              line.textContent = text
              content.appendChild(line)
            }
            return content
          }
        },
        series: [
          {
            type: 'pie',
            radius: ['62%', '84%'],
            startAngle: 90,
            clockwise: true,
            label: { show: false },
            labelLine: { show: false },
            emphasis: { scale: true, scaleSize: 6 },
            itemStyle: {
              borderWidth: 2,
              borderRadius: 3,
              borderColor: styles.getPropertyValue('--surface').trim()
            },
            data: shown.map((item) => ({
              name: item.name,
              value: item.amount,
              itemStyle: { color: item.color }
            }))
          }
        ]
      })
      chart.on('mouseover', (params) => notify.current(keyOf(shown[params.dataIndex])))
      chart.on('globalout', () => notify.current(null))
    })
    return () => {
      alive = false
      observer.disconnect()
      chart?.dispose()
      chartRef.current = undefined
    }
  }, [items])
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.dispatchAction({ type: 'downplay', seriesIndex: 0 })
    if (activeIndex >= 0)
      chart.dispatchAction({ type: 'highlight', seriesIndex: 0, dataIndex: activeIndex })
  }, [activeIndex])
  const focused = activeIndex >= 0 ? visible[activeIndex] : null
  return (
    <div className="dashboard-donut-frame">
      <div
        className="dashboard-donut"
        ref={container}
        role="img"
        aria-label="용도별 자산 구성 도넛 차트. 금액과 비중은 구성 목록에서 확인할 수 있습니다."
        style={{ minWidth: 0, height: 240 }}
      />
      <div className="dashboard-donut-center" aria-hidden="true">
        <span className="muted">{focused ? focused.name : '전체'}</span>
        <strong>
          {focused ? `${focused.share!.toFixed(1)}%` : total === null ? '-' : money(total)}
        </strong>
      </div>
    </div>
  )
}
