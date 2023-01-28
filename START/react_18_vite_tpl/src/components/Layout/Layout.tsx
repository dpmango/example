import { Header } from '@c/Layout'
import cns from 'classnames'

interface ILayout {
  children: React.ReactElement[] | React.ReactElement
}

export const Layout: React.FC<ILayout> = ({ children }) => {
  const { pathname } = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()

  return (
    <>
      <div className={cns('layout')}>
        <Header />
        {children}
      </div>
    </>
  )
}
