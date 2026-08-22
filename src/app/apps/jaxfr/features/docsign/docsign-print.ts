import {
  Component,
  OnInit,
  computed,
  inject,
} from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { DisplayNamePipe } from '../../../../core/pipes/display-name.pipe';
import { UserService } from '../user/user.service';
import {
  DocsignDocumentView,
  DocsignSignerSlot,
} from './docsign-document';
import { DocsignService } from './docsign.service';
import {
  bodyContent,
  currentVersion,
  documentNo,
  docsignLifecycle,
  signaturesForVersion,
} from './docsign.util';

@Component({
  selector: 'app-docsign-print',
  standalone: true,
  imports: [RouterModule, DocsignDocumentView],
  providers: [DisplayNamePipe],
  templateUrl: './docsign-print.html',
  styleUrl: './docsign-print.scss',
})
export class DocsignPrint implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private displayNamePipe = inject(DisplayNamePipe);

  public docsignService = inject(DocsignService);
  public userService = inject(UserService);

  private id = this.route.snapshot.paramMap.get('id');

  loaded = computed(() =>
    this.docsignService
      .documents()
      .find((doc) => doc.tb_tyapp_dsgn_id === this.id),
  );

  paperSigners = computed<DocsignSignerSlot[]>(() => {
    const loaded = this.loaded();
    if (!loaded) return [];
    const version = currentVersion(loaded);
    const sigs = signaturesForVersion(
      loaded.signatures,
      version?.tb_tyapp_dsgn_ver_id,
    );
    return loaded.signer_user_ids.map((userId) => {
      const user = this.userService.users().find((item) => item.user_id === userId);
      const sig = sigs.find((item) => item.user_id === userId);
      return {
        userId,
        name: user ? this.displayNamePipe.transform(user) : 'Unknown',
        signedName: sig?.signed_name ?? null,
        signedMark: sig?.signed_mark ?? null,
        signedAt: sig?.signed_at ?? null,
        signedSvg: sig?.signed_svg ?? null,
      };
    });
  });

  content = computed(() => {
    const loaded = this.loaded();
    return loaded ? bodyContent(loaded) : '';
  });

  documentNoLabel = computed(() =>
    documentNo(this.loaded()?.tb_tyapp_dsgn_seq_no),
  );

  lifecycle = computed(() =>
    docsignLifecycle(this.loaded()?.sent_at, this.loaded()?.locked_at),
  );

  async ngOnInit() {
    await Promise.all([
      this.docsignService.fetchAllDocuments(),
      this.userService.fetchAllUsers(),
    ]);
    const id = this.id;
    if (!id) {
      this.router.navigate(['/docsign/list']);
      return;
    }
    const doc =
      this.loaded() ?? (await this.docsignService.fetchDocumentById(id));
    if (!doc?.locked_at) {
      this.router.navigate(['/docsign/edit', id]);
      return;
    }
    setTimeout(() => window.print(), 50);
  }

  onPrint() {
    window.print();
  }
}
