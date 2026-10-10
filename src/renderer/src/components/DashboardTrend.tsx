import { useEffect, useRef } from 'react'
import { init, use as registerCharts, type EChartsType } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { DashboardData } from '@shared/ipc'
import { money } from './domain-ui'
import { getReducedMotion } from '../hooks/useReducedMotion'

registerCharts([LineChart, GridComponent, TooltipComponent, CanvasRenderer])

function trendAxisAmount(value: number): string {
  const amount = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (amount >= 100_000_000) return `${sign}${Number((amount / 100_000_000).toFixed(1))}억`
  if (amount >= 10_000) return `${sign}${Math.round(amount / 10_000).toLocaleString('ko-KR')}만`
  return value.toLocaleString('ko-KR')
}

export default function DashboardTrend({
  points
}: {
  points: DashboardData['trend']['points']
}): React.JSX.Element {
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = container.current
    if (!element) return
    let active = true
    let chart: EChartsType | undefined
    const observer = new ResizeObserver(() => chart?.resize())
    observer.observe(element)
    void document.fonts.load('12px Pretendard').then(() => {
      if (!active || !document.fonts.check('12px Pretendard')) return
      const styles = getComputedStyle(element)
      const color = (token: string): string => styles.getPropertyValue(`--${token}`).trim()
      chart = init(element)
      chart.setOption({
        animation: !getReducedMotion(),
        textStyle: { fontFamily: 'Pretendard', fontSize: 12 },
        grid: { left: 12, right: 24, top: 24, bottom: 12, containLabel: true },
        tooltip: {
          trigger: 'item',
          confine: true,
          backgroundColor: color('surface'),
          borderColor: color('border'),
          borderWidth: 1,
          textStyle: { color: color('text'), fontFamily: 'Pretendard', fontSize: 14 },
          extraCssText: 'border-radius:8px;box-shadow:none;white-space:normal;',
          formatter: (params: { dataIndex: number }) => {
            const point = points[params.dataIndex]
            const content = document.createElement('div')
            content.style.maxWidth = `${Math.max(0, element.clientWidth - 24)}px`
            content.style.overflowWrap = 'anywhere'
            for (const text of [
              point.date,
              money(point.amount),
              ...(point.predicted ? ['예상'] : [])
            ]) {
              const line = document.createElement('div')
              line.textContent = text
              content.appendChild(line)
            }
            return content
          }
        },
        xAxis: {
          type: 'category',
          boundaryGap: false,
          data: points.map((point) => point.date),
          axisLine: { lineStyle: { color: color('border') } },
          axisTick: { lineStyle: { color: color('border') } },
          axisLabel: {
            color: color('muted'),
            fontSize: 12,
            hideOverlap: true,
            formatter: (date: string, index: number) =>
              index === 0
                ? '오늘'
                : date.slice(5, 7) === '01'
                  ? `${date.slice(2, 4)}년 1월`
                  : `${Number(date.slice(5, 7))}월`
          }
        },
        yAxis: {
          type: 'value',
          axisLine: { show: true, lineStyle: { color: color('border') } },
          axisTick: { show: true, lineStyle: { color: color('border') } },
          splitLine: { lineStyle: { color: color('border') } },
          axisLabel: { color: color('muted'), fontSize: 12, formatter: trendAxisAmount }
        },
        series: [
          {
            type: 'line',
            showAllSymbol: true,
            symbol: 'circle',
            symbolSize: 6,
            lineStyle: { color: color('focus'), width: 2 },
            itemStyle: { color: color('focus') },
            data: points.map((point) => point.amount)
          }
        ]
      })
    })
    return () => {
      active = false
      observer.disconnect()
      chart?.dispose()
    }
  }, [points])
  return (
    <div
      ref={container}
      className="dashboard-trend"
      role="img"
      aria-label="열두 달 예상 잔액 선 그래프. 오늘과 마지막 예상 잔액은 추이 요약에서 확인할 수 있습니다."
    />
  )
}
