// The website uses Next's built-in styled-jsx (<style jsx global>) in a couple of
// places. Here those render as plain global <style> tags; declare the attributes
// the way Next's own types do.
import "react";

declare module "react" {
    interface StyleHTMLAttributes<T> {
        jsx?: boolean;
        global?: boolean;
    }
}
