interface ISvgIcon {
  prefix?: string
  name: string
}

export const SvgIcon: React.FC<ISvgIcon> = ({ prefix, name }) => {
  const symbolId = `#${prefix}-${name}`
  return (
    <svg className="svg-icon" aria-hidden="true">
      <use href={symbolId} />
    </svg>
  )
}
