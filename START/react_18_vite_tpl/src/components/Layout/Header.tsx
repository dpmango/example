import { DevBadge } from '@ui'
import cns from 'classnames'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

export const Header: React.FC = () => {
  const [menu, setMenu] = useState(false)

  const { t } = useTranslation('header')

  return (
    <header className="header">
      <div className="container">
        <Link to="/" className="header__logo">
          <DevBadge />
        </Link>
        <div className={cns('menu', menu && '_active')} onClick={() => setMenu(!menu)}>
          <div></div>
        </div>
      </div>
    </header>
  )
}
