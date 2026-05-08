import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  AbstractControl,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

function passwordsMatchValidator(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value as string;
  const confirmPassword = group.get('confirmPassword')?.value as string;
  return password && confirmPassword && password !== confirmPassword
    ? { passwordMismatch: true }
    : null;
}

interface LoginFormType {
  email: FormControl<string>;
  password: FormControl<string>;
}

interface SignUpFormType {
  email: FormControl<string>;
  password: FormControl<string>;
  confirmPassword: FormControl<string>;
}

interface ForgotFormType {
  email: FormControl<string>;
}

@Component({
  selector: 'app-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly platformId = inject(PLATFORM_ID);

  readonly leftMode = signal<'login' | 'forgot'>('login');

  readonly showLoginPw = signal(false);
  readonly showSignUpPw = signal(false);
  readonly showConfirmPw = signal(false);

  readonly loginLoading = signal(false);
  readonly signUpLoading = signal(false);
  readonly resetLoading = signal(false);
  readonly oauthLoading = signal<'google' | null>(null);

  readonly loginError = signal<string | null>(null);
  readonly signUpError = signal<string | null>(null);
  readonly resetError = signal<string | null>(null);

  readonly resetSent = signal(false);
  readonly signUpConfirmPending = signal(false);

  readonly loginForm: FormGroup<LoginFormType> = this.fb.group({
    email: this.fb.nonNullable.control('', [Validators.required, Validators.email]),
    password: this.fb.nonNullable.control('', Validators.required),
  });

  readonly signUpForm: FormGroup<SignUpFormType> = this.fb.group(
    {
      email: this.fb.nonNullable.control('', [Validators.required, Validators.email]),
      password: this.fb.nonNullable.control('', [Validators.required, Validators.minLength(8)]),
      confirmPassword: this.fb.nonNullable.control('', Validators.required),
    },
    { validators: passwordsMatchValidator },
  );

  readonly forgotForm: FormGroup<ForgotFormType> = this.fb.group({
    email: this.fb.nonNullable.control('', [Validators.required, Validators.email]),
  });

  async onLogin(): Promise<void> {
    this.loginForm.markAllAsTouched();
    if (this.loginForm.invalid || this.loginLoading()) return;

    this.loginLoading.set(true);
    this.loginError.set(null);

    try {
      await this.auth.signInWithEmail(
        this.loginForm.controls.email.value,
        this.loginForm.controls.password.value,
      );
      await this.router.navigate(['/dashboard']);
    } catch (err: unknown) {
      this.loginError.set(this.friendly(err));
    } finally {
      this.loginLoading.set(false);
    }
  }

  async onSignUp(): Promise<void> {
    this.signUpForm.markAllAsTouched();
    if (this.signUpForm.invalid || this.signUpLoading()) return;

    this.signUpLoading.set(true);
    this.signUpError.set(null);

    try {
      const loggedIn = await this.auth.signUpWithEmail(
        this.signUpForm.controls.email.value,
        this.signUpForm.controls.password.value,
      );
      if (loggedIn) {
        await this.router.navigate(['/dashboard']);
      } else {
        this.signUpConfirmPending.set(true);
      }
    } catch (err: unknown) {
      this.signUpError.set(this.friendly(err));
    } finally {
      this.signUpLoading.set(false);
    }
  }

  async onResetPassword(): Promise<void> {
    this.forgotForm.markAllAsTouched();
    if (this.forgotForm.invalid || this.resetLoading()) return;

    this.resetLoading.set(true);
    this.resetError.set(null);

    try {
      await this.auth.resetPasswordForEmail(this.forgotForm.controls.email.value);
      this.resetSent.set(true);
    } catch (err: unknown) {
      this.resetError.set(this.friendly(err));
    } finally {
      this.resetLoading.set(false);
    }
  }

  async onLoginWithGoogle(): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || this.oauthLoading()) return;

    this.oauthLoading.set('google');
    this.signUpError.set(null);
    try {
      await this.auth.signInWithGoogle();
    } catch (err: unknown) {
      this.signUpError.set(this.friendly(err));
      this.oauthLoading.set(null);
    }
  }

  hasError(form: FormGroup, ctrl: string, err: string): boolean {
    const control = form.get(ctrl);
    return !!(control?.touched && control.hasError(err));
  }

  hasGroupError(form: FormGroup, err: string): boolean {
    return !!(form.touched && form.hasError(err));
  }

  private friendly(err: unknown): string {
    if (!(err instanceof Error)) return 'Something went wrong. Please try again.';

    const message = err.message.toLowerCase();
    if (message.includes('invalid login credentials') || message.includes('invalid credentials')) {
      return 'Incorrect email or password.';
    }
    if (message.includes('email not confirmed')) {
      return 'Please verify your email before logging in.';
    }
    if (message.includes('already registered') || message.includes('user already exists')) {
      return 'An account with this email already exists. Try logging in.';
    }
    if (message.includes('password should be at least')) {
      return 'Password must be at least 8 characters.';
    }
    if (message.includes('rate limit') || message.includes('too many')) {
      return 'Too many attempts - please wait a moment and try again.';
    }

    return err.message;
  }
}
