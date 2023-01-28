import { Layout } from '@c/Layout'
import cns from 'classnames'
import { Helmet } from 'react-helmet'

export const HomePage: React.FC = () => {
  const [loaderShown, setLoaderShown] = useState<boolean>(false)
  const { userData } = useAppSelector((state) => state.userState)

  const { search } = useLocation()
  const { lockScroll, unlockScroll } = useScrollLock()

  return (
    <Layout>
      <Helmet>
        <title>{import.meta.env.VITE_APP_APP_NAME} | Homepage</title>
      </Helmet>

      <div className={cns('content')}>
        <div className="container">
          <h1>Hello, world</h1>
        </div>
      </div>
    </Layout>
  )
}
