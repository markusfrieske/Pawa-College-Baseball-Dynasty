import { useState } from "react";
import { Link, useLocation } from "wouter";
import { RetroButton } from "@/components/ui/retro-button";
import { RetroInput } from "@/components/ui/retro-input";
import { RetroCard, RetroCardHeader, RetroCardContent } from "@/components/ui/retro-card";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle } from "lucide-react";

interface AuthPageProps {
  mode: "login" | "register";
}

export default function AuthPage({ mode }: AuthPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const authMutation = useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      return apiRequest("POST", endpoint, data);
    },
    onSuccess: () => {
      toast({
        title: mode === "login" ? "Welcome back!" : "Account created!",
        description: mode === "login" 
          ? "You have successfully signed in."
          : "Your account has been created. Welcome to College Baseball Dynasty!",
      });
      setLocation("/dashboard");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "An error occurred. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (mode === "register" && password !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure your passwords match.",
        variant: "destructive",
      });
      return;
    }

    authMutation.mutate({ email, password });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/">
            <div className="inline-flex items-center gap-3 cursor-pointer">
              <div className="w-12 h-12 bg-gold rounded-full flex items-center justify-center">
                <span className="text-forest-dark font-pixel text-sm">CBD</span>
              </div>
            </div>
          </Link>
        </div>

        <RetroCard variant="bordered">
          <RetroCardHeader className="text-center">
            {mode === "login" ? "Sign In" : "Create Account"}
          </RetroCardHeader>
          <RetroCardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <RetroInput
                id="email"
                type="email"
                label="Email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="input-email"
              />
              <RetroInput
                id="password"
                type="password"
                label="Password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-testid="input-password"
              />
              {mode === "register" && (
                <RetroInput
                  id="confirmPassword"
                  type="password"
                  label="Confirm Password"
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  data-testid="input-confirm-password"
                />
              )}
              <RetroButton
                type="submit"
                className="w-full"
                disabled={authMutation.isPending}
                data-testid="button-submit-auth"
              >
                {authMutation.isPending
                  ? "Loading..."
                  : mode === "login"
                  ? "Sign In"
                  : "Create Account"}
              </RetroButton>
            </form>

            <div className="mt-6 text-center text-sm text-muted-foreground">
              {mode === "login" ? (
                <>
                  Don't have an account?{" "}
                  <Link href="/register" className="text-gold hover:underline" data-testid="link-register">
                    Sign up
                  </Link>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <Link href="/login" className="text-gold hover:underline" data-testid="link-login">
                    Sign in
                  </Link>
                </>
              )}
            </div>
          </RetroCardContent>
        </RetroCard>

        <div className="mt-4 text-center">
          <Link href="/guest" className="text-muted-foreground text-sm hover:text-gold transition-colors" data-testid="link-guest">
            Continue as Guest
          </Link>
        </div>
      </div>
    </div>
  );
}

export function GuestWarningModal({ onContinue, onBack, isLoading }: { onContinue: () => void; onBack: () => void; isLoading?: boolean }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <RetroCard variant="bordered" className="max-w-md">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="w-6 h-6 text-gold" />
          <h2 className="font-pixel text-gold text-sm">Guest Mode Warning</h2>
        </div>
        <p className="text-muted-foreground mb-6 leading-relaxed">
          Playing as a guest means your leagues will NOT be saved. When you leave or refresh the page, all progress will be lost. Sign in to save your leagues permanently.
        </p>
        <div className="flex gap-3">
          <RetroButton variant="outline" onClick={onBack} className="flex-1" data-testid="button-go-back" disabled={isLoading}>
            Go Back
          </RetroButton>
          <RetroButton onClick={onContinue} className="flex-1" data-testid="button-continue-guest" disabled={isLoading}>
            {isLoading ? "Loading..." : "Continue as Guest"}
          </RetroButton>
        </div>
      </RetroCard>
    </div>
  );
}
