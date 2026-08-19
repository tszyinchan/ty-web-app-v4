import { Routes } from '@angular/router';
import { ChatPage } from './chat-page';
import { ChatRoomManage } from './chat-room-manage';
import { ChatRoomMembers } from './chat-room-members';
import { ChatRoomNew } from './chat-room-new';
import { unsavedChangesGuard } from '../../../../core/guards/unsaved-changes.guard';

export const CHAT_ROUTES: Routes = [
  {
    path: '',
    children: [
      {
        path: 'new',
        component: ChatRoomNew,
        canDeactivate: [unsavedChangesGuard],
      },
      {
        path: ':roomId/manage',
        component: ChatRoomManage,
        canDeactivate: [unsavedChangesGuard],
      },
      {
        path: ':roomId/manage/members',
        component: ChatRoomMembers,
      },
      { path: ':roomId', component: ChatPage },
      { path: '', component: ChatPage },
    ],
  },
];
