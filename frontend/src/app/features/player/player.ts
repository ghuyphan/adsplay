import { CommonModule } from '@angular/common';
import { Component, DestroyRef, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { combineLatest } from 'rxjs';
import { PlayerSessionService } from './player-session.service';

@Component({
  selector: 'app-player',
  imports: [CommonModule],
  providers: [PlayerSessionService],
  templateUrl: './player.html',
  styleUrl: './player.css',
})
export class Player implements OnInit, OnDestroy {
  readonly session = inject(PlayerSessionService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild('videoPlayer')
  set videoPlayer(element: ElementRef<HTMLVideoElement> | undefined) {
    this.session.attachVideoElement(element?.nativeElement || null);
  }

  @ViewChild('container')
  set container(element: ElementRef<HTMLDivElement> | undefined) {
    this.session.attachContainerElement(element?.nativeElement || null);
  }

  ngOnInit() {
    this.session.initialize();
    combineLatest([this.route.params, this.route.queryParamMap])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([params, queryParamMap]) => {
        this.session.handleRoute(params['profileName'], queryParamMap.get('token'));
      });
  }

  ngOnDestroy() {
    this.session.destroy();
  }
}
