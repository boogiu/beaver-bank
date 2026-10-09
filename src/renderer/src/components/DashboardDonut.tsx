import { useEffect, useRef } from 'react'
import { init, use as registerCharts, type EChartsType } from 'echarts/core'
import { PieChart } from 'echarts/charts'
import { TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { DashboardData } from '@shared/ipc'
import { money } from './domain-ui'

registerCharts([PieChart, TooltipComponent, CanvasRenderer])

type Composition = DashboardData['assets']['composition']

export default function DashboardDonut({ items }: { items: Composition }): React.JSX.Element {
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = container.current
    if (!element) return
    let active = true
    let chart: EChartsType | undefined
    const observer = new ResizeObserver(() => chart?.resize())
    observer.observe(element)
    // 시작 페이지에서도 글꼴이 준비된 뒤 최초 캔버스를 그린다.
    void document.fonts.load('12px Pretendard').then(() => {
      if (!active || !document.fonts.check('12px Pretendard')) return
      const visible = items.filter((item) => item.share !== null)
      const styles = getComputedStyle(element)
      chart = init(element)
      chart.setOption({
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
            const item = visible[params.dataIndex]
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
            radius: ['48%', '74%'],
            startAngle: 90,
            clockwise: true,
            label: { show: false },
            labelLine: { show: false },
            itemStyle: { borderWidth: 2, borderColor: styles.getPropertyValue('--surface').trim() },
            data: visible.map((item) => ({
              name: item.name,
              value: item.amount,
              itemStyle: { color: item.color }
            }))
          }
        ]
      })
    })
    return () => {
      active = false
      observer.disconnect()
      chart?.dispose()
    }
  }, [items])
  return (
    <div
      className="dashboard-donut"
      ref={container}
      role="img"
      aria-label="용도별 자산 구성 도넛 차트. 금액과 비중은 구성 목록에서 확인할 수 있습니다."
      style={{ minWidth: 0, height: 240 }}
    />
  )
}
