import type { PayloadAction } from '@reduxjs/toolkit'
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import dayjs from 'dayjs'
import Cookies from 'js-cookie'

import { IUserDto } from '@/core/interface/User'

export interface IUser {
  loading: boolean | null
  userData: IUserDto | null
}

export const getCurrentUser = createAsyncThunk('user/getCurrentUser', async () => {
  const { data } = await api('auth/user/', {})

  return data
})

const initialState: IUser = {
  loading: null,
  userData: null,
}

export const userState = createSlice({
  name: 'counter',
  initialState,
  reducers: {
    resetUser(state, action: PayloadAction) {
      Cookies.remove('auth')

      state.loading = false
      state.userData = null
    },
  },
  extraReducers: (builder) => {
    builder.addCase(getCurrentUser.pending, (state) => {
      state.loading = true
    })
    builder.addCase(getCurrentUser.fulfilled, (state, action: PayloadAction<IUserDto>) => {
      state.loading = false

      if (action.payload) {
        state.userData = {
          ...action.payload,
        }
      }
    })
  },
})

export const { resetUser } = userState.actions

export default userState.reducer
