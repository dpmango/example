import { ToastContainer } from 'react-toastify'
import { YMInitializer } from 'react-yandex-metrika'

import Router from '@/pages/Routes'

interface IThemeContext {
  theme: boolean
  changeTheme: () => void
}

function App() {
  const [searchParams, setSearchParams] = useSearchParams()

  return (
    <>
      <Router />
      <ToastContainer />

      {import.meta.env.REACT_APP_YM_ID && (
        <YMInitializer
          accounts={[+import.meta.env.REACT_APP_YM_ID]}
          options={{ webvisor: true }}
          version="2"
        />
      )}
    </>
  )
}

export default App
