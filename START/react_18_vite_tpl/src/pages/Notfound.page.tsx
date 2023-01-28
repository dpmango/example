import { Helmet } from 'react-helmet'

export const NotFound: React.FC = () => {
  return (
    <>
      <Helmet>
        <title>{import.meta.env.VITE_APP_APP_NAME} | 404</title>
      </Helmet>

      <h1>404</h1>
    </>
  )
}
